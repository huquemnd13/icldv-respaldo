document.addEventListener("DOMContentLoaded", function () {
    // Obtenemos el token del localStorage
    const token = localStorage.getItem("token"); // Asegúrate de que el nombre del token sea "token"
    console.log(token);

    // Decodificamos el token usando jwt_decode
    const decodedToken = jwt_decode(token);
    console.log(decodedToken.nombre_completo); // Muestra el nombre completo en la consola

    // Mostramos el nombre del usuario en la pantalla
    if (decodedToken && decodedToken.nombre_completo) {
        document.getElementById("username").textContent = decodedToken.nombre_completo;
    } else {
        document.getElementById("username").textContent = "Invitado";
    }
});
