"""Agendador de execução em lote (roda NO daemon, pois o device é local).

Lê `test_schedules` e dispara `run_batch` quando chega a hora. O cálculo do
próximo disparo é feito sem dependência externa (sem croniter): suporta os
5 campos cron padrão (minuto, hora, dia-do-mês, mês, dia-da-semana) com `*`,
listas (`1,3`), faixas (`1-5`) e passos (`*/6`) — cobre os presets do front e
mais. Timezone via `zoneinfo` (nativo no 3.11).
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger("scheduler")

POLL_SECONDS = 60


def _supabase() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")
    return url, key


def _headers(key: str, prefer: str = "") -> dict:
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    return h


# ── Cron ────────────────────────────────────────────────────────────────────

def _parse_field(spec: str, lo: int, hi: int) -> set[int]:
    """Converte um campo cron em conjunto de inteiros permitidos."""
    allowed: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        step = 1
        if "/" in part:
            base, step_s = part.split("/", 1)
            step = max(1, int(step_s))
        else:
            base = part
        if base == "*":
            start, end = lo, hi
        elif "-" in base:
            a, b = base.split("-", 1)
            start, end = int(a), int(b)
        else:
            start = end = int(base)
        for v in range(start, end + 1, step):
            if lo <= v <= hi:
                allowed.add(v)
    return allowed


def _matches(dt: datetime, fields: list[set[int]]) -> bool:
    minute, hour, dom, month, dow = fields
    # cron dow: 0=domingo … 6=sábado (7 também = domingo). Python weekday: Seg=0.
    cron_dow = (dt.weekday() + 1) % 7
    dow_ok = cron_dow in dow or (7 in dow and cron_dow == 0)
    return (dt.minute in minute and dt.hour in hour
            and dt.day in dom and dt.month in month and dow_ok)


def compute_next_run(cron: str, tz_name: str, after_utc: datetime | None = None) -> datetime | None:
    """Próximo disparo (UTC) após `after_utc`, no fuso `tz_name`."""
    parts = cron.split()
    if len(parts) != 5:
        logger.warning(f"[scheduler] cron inválido: {cron!r}")
        return None
    try:
        fields = [
            _parse_field(parts[0], 0, 59),
            _parse_field(parts[1], 0, 23),
            _parse_field(parts[2], 1, 31),
            _parse_field(parts[3], 1, 12),
            _parse_field(parts[4], 0, 7),
        ]
        tz = ZoneInfo(tz_name or "America/Sao_Paulo")
    except Exception as e:
        logger.warning(f"[scheduler] erro ao parsear cron {cron!r}: {e}")
        return None

    after = (after_utc or datetime.now(timezone.utc)).astimezone(tz)
    # Começa no próximo minuto cheio.
    cur = (after + timedelta(minutes=1)).replace(second=0, microsecond=0)
    # Procura por até ~366 dias (em minutos).
    for _ in range(366 * 24 * 60):
        if _matches(cur, fields):
            return cur.astimezone(timezone.utc)
        cur += timedelta(minutes=1)
    return None


# ── Loop ──────────────────────────────────────────────────────────────────--

async def _fire(client: httpx.AsyncClient, url: str, key: str, sched: dict):
    """Cria o lote e dispara a execução; reprograma o próximo disparo."""
    from services.maestro.batch import run_batch

    sid = sched["id"]
    test_ids = sched.get("test_ids") or []
    udid = sched.get("device_udid") or ""
    project_id = sched.get("project_id")
    now = datetime.now(timezone.utc)
    next_run = compute_next_run(sched.get("cron", ""), sched.get("timezone", "America/Sao_Paulo"), now)

    # Reprograma ANTES de executar para evitar disparo duplicado se o lote demorar.
    await client.patch(
        f"{url}/rest/v1/test_schedules",
        headers=_headers(key, "return=minimal"),
        params={"id": f"eq.{sid}"},
        json={"last_run_at": now.isoformat(),
              "next_run_at": next_run.isoformat() if next_run else None},
        timeout=15,
    )

    if not test_ids or not udid or not project_id:
        logger.warning(f"[scheduler] agendamento {sid} incompleto — pulando disparo")
        return

    # Cria o lote (triggered_by=schedule) e executa em background.
    resp = await client.post(
        f"{url}/rest/v1/test_batch_runs",
        headers=_headers(key, "return=representation"),
        json={
            "project_id": project_id,
            "name": sched.get("name") or f"Agendado: {len(test_ids)} teste(s)",
            "status": "pending",
            "triggered_by": "schedule",
            "device_udid": udid,
            "total_tests": len(test_ids),
            "schedule_id": sid,
        },
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        logger.error(f"[scheduler] falha ao criar lote do agendamento {sid}: {resp.text[:200]}")
        return
    batch_run_id = resp.json()[0]["id"]
    logger.info(f"[scheduler] disparando agendamento {sid} → lote {batch_run_id} ({len(test_ids)} testes)")
    asyncio.create_task(run_batch(project_id, test_ids, udid, batch_run_id))


async def scheduler_loop():
    """Background: a cada minuto, dispara agendamentos vencidos."""
    url, key = _supabase()
    if not url or not key:
        logger.warning("[scheduler] sem SUPABASE_URL/KEY — agendador desativado")
        return
    logger.info("[scheduler] agendador de lotes iniciado")
    while True:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            async with httpx.AsyncClient(verify=False) as client:
                resp = await client.get(
                    f"{url}/rest/v1/test_schedules",
                    headers=_headers(key),
                    params={
                        "is_active": "eq.true",
                        "next_run_at": f"lte.{now_iso}",
                        "select": "id,project_id,name,test_ids,device_udid,cron,timezone",
                        "limit": "20",
                    },
                    timeout=20,
                )
                if resp.status_code == 200:
                    for sched in resp.json():
                        try:
                            await _fire(client, url, key, sched)
                        except Exception as e:
                            logger.warning(f"[scheduler] erro ao disparar {sched.get('id')}: {e}")
        except Exception as e:
            logger.debug(f"[scheduler] loop swallowed: {e}")
        await asyncio.sleep(POLL_SECONDS)
