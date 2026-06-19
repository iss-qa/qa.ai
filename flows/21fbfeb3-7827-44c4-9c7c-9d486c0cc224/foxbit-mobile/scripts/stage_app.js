// /scripts/stage_app.js
// Este script é chamado via runScript no Maestro.
// O Maestro executa JS em sandbox GraalJS — sem acesso a shell/OS.
// A troca de perfil (user 10) deve ser feita via comando ADB ANTES do teste.
// Este script apenas registra no output que o ambiente é staging (work profile).

output.stageEnv = {
    profile: "stage",
    userId: "10",
    appId: "br.com.foxbit.foxbitandroid",
    activity: ".MainActivity"
};

console.log("Stage environment configurado para Work Profile (user 10)");