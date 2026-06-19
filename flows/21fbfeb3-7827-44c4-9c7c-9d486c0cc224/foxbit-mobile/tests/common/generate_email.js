// generate_email.js
// Gera um email randômico compatível com o Mailosaur e uma senha forte

function generateRandomString(length) {
    var result = '';
    var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// 1. Configurações do Mailosaur
// Importante: O domínio do email é o "Server Domain" (ex: 6i70822u)
// O ID longo (wGYOSee...) é usado apenas na API do fetch_email_link_mailosaur.js
const MAILOSAUR_SERVER_DOMAIN = "6i70822u"; 

// 2. Definição do Prefixo
var prefix = "maestro";
if (typeof env !== 'undefined' && env.EMAIL_PREFIX) {
    prefix = env.EMAIL_PREFIX;
}

// 3. Geração dos Dados
const randomId = generateRandomString(6);
const login = prefix + "-" + randomId;
const domain = MAILOSAUR_SERVER_DOMAIN + ".mailosaur.net";
const email = login + "@" + domain;

// 4. Saída para o Maestro
output.TEMP_EMAIL = email;
output.RANDOM_ID = randomId;
// Senha forte com no mínimo 12 caracteres: Foxbit exige Letra Maiúscula, Minúscula, Número e Especial
output.TEMP_PASSWORD = "Foxbit@Test" + Math.floor(Math.random() * 90000 + 10000);

console.log("📧 Email Mailosaur Gerado: " + output.TEMP_EMAIL);
console.log("🔐 Senha Gerada: " + output.TEMP_PASSWORD);