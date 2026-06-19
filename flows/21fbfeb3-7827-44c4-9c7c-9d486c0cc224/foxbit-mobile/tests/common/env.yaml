// Script global para injeção de estado no Maestro
// Como subflows (runFlow) isolam o escopo de `output`, chamamos esse runScript diretamente nas roots.

var d = new Date();
var ts = d.getFullYear() + '-' + 
         (d.getMonth()+1).toString().padStart(2,'0') + '-' + 
         d.getDate().toString().padStart(2,'0') + '_' + 
         d.getHours().toString().padStart(2,'0') + '-' + 
         d.getMinutes().toString().padStart(2,'0') + '-' + 
         d.getSeconds().toString().padStart(2,'0');

// Define a pasta onde os arquivos serão salvos por este run
output.SCREENSHOT_DIR_DYNAMIC = (typeof SCREENSHOT_DIR !== 'undefined' && SCREENSHOT_DIR !== '') ? SCREENSHOT_DIR : ('screenshots/' + ts);
