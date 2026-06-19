// fetch_email_link.js
// Faz o polling na API do 1secmail aguardando um email com link de verificação

const login = output.TEMP_EMAIL_LOGIN;
const domain = output.TEMP_EMAIL_DOMAIN;

let link = null;

console.log("Aguardando email para: " + login + "@" + domain);

// Aguarda até 120 segundos (30 * 4s)
for(let i = 0; i < 30; i++) { 
    try {
        var response = http.request('https://inboxkitten.com/api/v1/mail/list?recipient=' + login);
        var messages = JSON.parse(response.body);
        
        if (messages && messages.length > 0) {
            var msgId = messages[0].message.id;
            var msgResponse = http.request('https://inboxkitten.com/api/v1/mail/getHtml?mailKey=' + msgId);
            
            // Inbox Kitten already returns exactly the raw HTML text string in body.
            var body = msgResponse.body || "";
            
            // Extrair todas as URLs
            var urls = body.match(/https?:\/\/[^\s"'<>\\]+/g);
        if (urls) {
            for (var j = 0; j < urls.length; j++) {
                var url = urls[j];
                // Ignorar redes sociais ou imagens
                if (url.indexOf('instagram.com') === -1 && 
                    url.indexOf('facebook.com') === -1 && 
                    url.indexOf('linkedin.com') === -1 && 
                    url.indexOf('twitter.com') === -1 &&
                    url.indexOf('.png') === -1 &&
                    url.indexOf('.jpg') === -1) {
                    
                    // remove pontuação do fim se tiver
                    url = url.replace(/[.)\]}]+$/, '');
                    
                    link = url;
                    console.log("Link de verificação encontrado: " + link);
                    break;
                }
            }
        }
        
        if (link) break;
    }
  } catch (e) {
    console.log("Erro ao buscar email: " + e.message);
  }
  
  // Sleep
  var start = new Date().getTime();
  while (new Date().getTime() < start + 4000);
}

output.EMAIL_VERIFICATION_LINK = link;

// IMPORTANTE: Retornamos o link para a automação abrir o próprio navegador ou app
if (link) {
    console.log("Link extraído com sucesso, delegando para o Maestro abrir...");
}
