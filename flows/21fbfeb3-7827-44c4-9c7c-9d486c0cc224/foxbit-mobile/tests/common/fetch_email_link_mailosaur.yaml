// fetch_email_link_mailosaur.js
const API_KEY = "xxzum6hRKd9kCwDCsQk3GgkD2mqFzK45";
const SERVER_ID = "wGYOSeeDJvoWowqBkUyag75VwejNgm9O";
const EMAIL_ADDRESS = output.TEMP_EMAIL; 

function b64Encode(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var out = '';
    for (var i = 0, len = str.length; i < len; i++) {
        var c1 = str.charCodeAt(i++) & 0xff;
        if (i == len) { out += chars.charAt(c1 >> 2); out += chars.charAt((c1 & 0x3) << 4); out += '=='; break; }
        var c2 = str.charCodeAt(i++) & 0xff;
        if (i == len) { out += chars.charAt(c1 >> 2); out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4)); out += chars.charAt((c2 & 0xf) << 2); out += '='; break; }
        var c3 = str.charCodeAt(i++) & 0xff;
        out += chars.charAt(c1 >> 2); out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xf0) >> 4)); out += chars.charAt(((c2 & 0xf) << 2) | ((c3 & 0xc0) >> 6)); out += chars.charAt(c3 & 0x3f);
    }
    return out;
}

let verificationLink = null;
const authHeader = "Basic " + b64Encode(API_KEY + ":");

console.log("🔍 Iniciando busca bruta para: " + EMAIL_ADDRESS);

try {
    var response = http.request({
        url: 'https://mailosaur.com/api/messages/await?server=' + SERVER_ID,
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentTo: EMAIL_ADDRESS })
    });

    if (response.status === 200) {
        var data = JSON.parse(response.body);
        var htmlContent = (data.html && data.html.body) ? data.html.body : "";
        
        // REGEX BRUTA: Procura qualquer URL que contenha 'verifycode'
        // Este padrão ignora se é um botão, texto ou imagem.
        var regex = /https?:\/\/[^\s"'<>]+verifycode=[^\s"'<>]+/g;
        var matches = htmlContent.match(regex);

        if (matches && matches.length > 0) {
            verificationLink = matches[0];
            console.log("✅ Link encontrado via Regex Bruta!");
        } else {
            // Log do HTML para debug se falhar
            console.log("⚠️ Regex não encontrou verifycode. Analisando todos os links...");
            var links = (data.html && data.html.links) ? data.html.links : [];
            for (var i = 0; i < links.length; i++) {
                if (links[i].href.indexOf('foxbit') !== -1) {
                    verificationLink = links[i].href;
                    break;
                }
            }
        }
    } else {
        console.log("❌ Erro API: " + response.status);
    }
} catch (e) {
    console.log("❌ Erro script: " + e.message);
}

if (verificationLink) {
    // Limpeza de entidades HTML (como &amp; que vira &)
    verificationLink = verificationLink.replace(/&amp;/g, '&');
    
    // Remove caracteres residuais do fim da URL
    verificationLink = verificationLink.replace(/[.)\]}>]+$/, '');
    
    output.EMAIL_VERIFICATION_LINK = verificationLink;
    console.log("🚀 URL Final Extraída: " + verificationLink);
} else {
    throw "ERRO FATAL: Não foi possível localizar a URL de verificação no HTML do e-mail.";
}