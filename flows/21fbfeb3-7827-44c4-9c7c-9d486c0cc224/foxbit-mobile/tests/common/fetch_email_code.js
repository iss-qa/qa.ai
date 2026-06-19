// fetch_email_code.js
// Faz o polling na API do 1secmail aguardando o código de ativação do Foxbit

const login = output.TEMP_EMAIL_LOGIN;
const domain = output.TEMP_EMAIL_DOMAIN;

let code = null;

console.log("Aguardando email para: " + login + "@" + domain);

// Tentamos 15 vezes (15 * 3s = 45 segundos)
for(let i = 0; i < 15; i++) {
  try {
    var response = http.request('https://www.1secmail.com/api/v1/?action=getMessages&login=' + login + '&domain=' + domain);
    var messages = JSON.parse(response.body);
    
    if (messages && messages.length > 0) {
        // Pega sempre a última mensagem
        var msgId = messages[0].id;
        var msgResponse = http.request('https://www.1secmail.com/api/v1/?action=readMessage&login=' + login + '&domain=' + domain + '&id=' + msgId);
        var msgData = JSON.parse(msgResponse.body);
        
        // Match regex para o código (ex: 6 dígitos)
        // Adjust if it is 4 or 6. Normalmente na Foxbit são 6.
        var match = msgData.textBody.match(/\b\d{6}\b/);
        
        if (match) {
            code = match[0];
            console.log("Código encontrado: " + code);
            break;
        }
    }
  } catch (e) {
    console.log("Aguardando recebimento... Erro/Demora na caixa de entrada.");
  }
  
  // Sleep / Busy wait (graaljs compatible)
  var start = new Date().getTime();
  while (new Date().getTime() < start + 3000);
}

output.EMAIL_CODE = code;
