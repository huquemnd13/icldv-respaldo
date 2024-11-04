const bcrypt = require('bcrypt');

// Lista de contraseñas
const passwords = [
  "Feliz#123Sol",
  "Sueña@456Luz",
  "Amigo$789Mar",
  "Cielo!321Sol",
  "Paz&456Risa",
  "Vida%789Dulz",
  "Amor123Paz",
  "Risa^456Sol",
  "Luz+789Gato",
  "Gato=123Luz",
  "Casa?456Luna",
  "Luna!789Cielo",
  "Roca#321Rio",
  "Rio&456Lago",
  "Sol%789Casa",
  "Rico@123Sol",
  "Lago456Olas",
  "Olas^789Vida"
];

// Número de rondas de salt
const saltRounds = 10;

// Función para hashear todas las contraseñas
async function hashPasswords() {
  for (const password of passwords) {
    const hash = await bcrypt.hash(password, saltRounds);
    console.log(`Contraseña: ${password}`);
    console.log(`Hash: ${hash}\n`);
  }
}

// Ejecuta la función
hashPasswords();
