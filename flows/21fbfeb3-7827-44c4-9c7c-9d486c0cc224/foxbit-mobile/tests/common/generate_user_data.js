function randomDigit() {
    return Math.floor(Math.random() * 9);
}

function generateCpf() {
    let n = Array.from({length: 9}, randomDigit);
    let d1 = n.reduce((total, number, index) => total + number * (10 - index), 0);
    d1 = 11 - (d1 % 11);
    if (d1 >= 10) d1 = 0;
    
    let d2 = n.reduce((total, number, index) => total + number * (11 - index), 0) + d1 * 2;
    d2 = 11 - (d2 % 11);
    if (d2 >= 10) d2 = 0;
    
    return n.join('') + d1 + d2;
}

const firstNames = [
  "Lucas", "Mariana", "Pedro", "Julia", "Roberto", "Ana", "Carlos", "Fernanda", "Gabriel", "Beatriz",
  "Ricardo", "Antonio", "Patricia", "Guilherme", "Camila", "Bruno", "Leticia", "Marcos", "Aline", "Vinicius",
  "Rafaela", "Daniel", "Vanessa", "Leonardo", "Bianca", "Hugo", "Larissa", "Thiago", "Isabela", "Diego",
  "Clara", "Andre", "Monique", "Felipe", "Sabrina", "Renato", "Priscila", "Samuel", "Taina", "Vitor",
  "Erika", "Augusto", "Jessica", "Arthur", "Debora", "Matheus", "Rebeca", "Caio", "Lorena", "Igor",
  "Tatiane", "Murilo", "Milena", "Douglas", "Soraia", "Heitor", "Veronica", "Wesley", "Nicole", "Ruan",
  "Stefany", "Yuri", "Katia", "Otavio", "Mirella", "Alexandre", "Luana", "Fabricio", "Brenda", "Marcelo",
  "Adriana", "Eduardo", "Gisele", "Renan", "Viviane", "Sandro", "Raissa", "Leandro", "Paloma", "Breno",
  "Talita", "Calebe", "Emanuelle", "Danilo", "Thais", "Jorge", "Julio", "Natalia", "Raul", "Cintia",
  "Fabio", "Monica", "Sergio", "Ester", "Rogerio", "Livia", "Cristiano", "Iris", "Marcio", "Perola"
];

const lastNames = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes",
  "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Lopes", "Soares", "Fernandes", "Vieira", "Barbosa",
  "Rocha", "Machado", "Dias", "Nascimento", "Menezes", "Teixeira", "Moreira", "Cardoso", "Freitas", "Guimaraes",
  "Melo", "Borges", "Santana", "Castro", "Pinto", "Cavalcanti", "Moura", "Correia", "Andrade", "Nunes",
  "Marques", "Batista", "Macedo", "Cunha", "Bezerra", "Aragao", "Pires", "Farias", "Tavares", "Cavalcante",
  "Dantas", "Assis", "Guedes", "Moraes", "Viana", "Brito", "Figueiredo", "Barros", "Azevedo", "Coelho",
  "Rezende", "Sales", "Guerra", "Bueno", "Paiva", "Duarte", "Queiroz", "Monteiro", "Mendes", "Pacheco",
  "Luz", "Brandao", "Bastos", "Fontes", "Aguiar", "Magalhaes", "Xavier", "Valente", "Mesquita", "Peixoto",
  "Siqueira", "Chagas", "Amaral", "Arruda", "Arantes", "Fonseca", "Santiago", "Cordeiro", "Miranda", "Galvao",
  "Lacerda", "Grangeiro", "Prado", "Campos", "Valle", "Lins", "Holanda", "Vilas Boas", "Dornelles", "Saraiva"
];

const randomFirstName = firstNames[Math.floor(Math.random() * firstNames.length)];
const randomLastName = lastNames[Math.floor(Math.random() * lastNames.length)];

output.USER_NAME = randomFirstName + " " + randomLastName + " Maestro";
output.USER_CPF = generateCpf();

console.log("👤 Nome Gerado: " + output.USER_NAME);
console.log("📄 CPF Gerado: " + output.USER_CPF);
