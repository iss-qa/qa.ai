// generate_company_data.js
// Gera CNPJ válido, Razão Social aleatória, Atividade e Telefone para testes PJ

function randomDigit() {
    return Math.floor(Math.random() * 9);
}

function generateCnpj() {
    // 8 dígitos base + 4 fixos (0001) para filial matriz
    var base = [];
    for (var i = 0; i < 8; i++) {
        base.push(randomDigit());
    }
    base.push(0, 0, 0, 1); // filial matriz

    // Peso do primeiro dígito verificador
    var peso1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma1 = 0;
    for (var i = 0; i < 12; i++) {
        soma1 += base[i] * peso1[i];
    }
    var d1 = soma1 % 11;
    d1 = d1 < 2 ? 0 : 11 - d1;
    base.push(d1);

    // Peso do segundo dígito verificador
    var peso2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma2 = 0;
    for (var i = 0; i < 13; i++) {
        soma2 += base[i] * peso2[i];
    }
    var d2 = soma2 % 11;
    d2 = d2 < 2 ? 0 : 11 - d2;
    base.push(d2);

    return base.join('');
}

var companyPrefixes = [
    "Tech", "Digital", "Nova", "Alpha", "Beta", "Sigma", "Prime", "Next", "Smart", "Inova",
    "Global", "Ultra", "Mega", "Quantum", "Pixel", "Core", "Apex", "Link", "Cloud", "Data",
    "Neo", "Pulsar", "Vertex", "Zenith", "Atlas", "Cosmos", "Titan", "Solar", "Vortex", "Matrix"
];

var companySuffixes = [
    "Solutions", "Services", "Group", "Hub", "Lab", "Systems", "Tech", "Corp", "Works", "Pro",
    "Connect", "Digital", "Wave", "Point", "Base", "Net", "Code", "Bit", "Soft", "App"
];

var randomPrefix = companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)];
var randomSuffix = companySuffixes[Math.floor(Math.random() * companySuffixes.length)];

output.COMPANY_CNPJ = generateCnpj();
output.COMPANY_NAME = randomPrefix + " " + randomSuffix + " Maestro";
output.COMPANY_ACTIVITY = "Serviços de tecnologia da informação";
output.COMPANY_PHONE = "11" + (Math.floor(Math.random() * 90000000) + 910000000).toString();

console.log("🏢 Razão Social: " + output.COMPANY_NAME);
console.log("📋 CNPJ Gerado: " + output.COMPANY_CNPJ);
console.log("📞 Telefone: " + output.COMPANY_PHONE);
console.log("💼 Atividade: " + output.COMPANY_ACTIVITY);
