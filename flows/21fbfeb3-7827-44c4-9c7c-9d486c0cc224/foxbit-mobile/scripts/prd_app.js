// /scripts/stage_app.js
// Este script é chamado via runScript no Maestro.
// O Maestro executa JS em sandbox GraalJS — sem acesso a shell/OS.
// A troca de perfil (user 0) deve ser feita via comando ADB ANTES do teste.
// Este script apenas registra no output que o ambiente é prd (user 0).

output.stageEnv = {
    profile: "prd",
    userId: "0",
    appId: "br.com.foxbit.foxbitandroid",
    activity: "com.foxbit.MainActivity"
};

console.log("PRD environment configurado para (user 0)");