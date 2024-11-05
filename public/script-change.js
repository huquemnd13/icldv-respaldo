// script-change.js
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById('updatePasswordForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value;
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    const token = localStorage.getItem('token'); // Usa el token guardado en el cliente

    try {
      const response = await fetch('/actualizar-contrasena', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, nuevaContrasena: newPassword, currentPassword })
      });

      // Manejar la respuesta
      if (!response.ok) {
        // Si la respuesta no es 2xx, lanza un error
        const errorResult = await response.json();
        document.getElementById('message').textContent = errorResult.message || "Error en la actualización de contraseña.";
        return;
      }

      const result = await response.json();
      document.getElementById('message').textContent = result.message;

    } catch (error) {
      document.getElementById('message').textContent = "Error en la actualización de contraseña.";
      console.error("Error en la solicitud:", error);
    }
  });
});

// Función para alternar la visibilidad de la contraseña
document.querySelectorAll('.toggle-password').forEach(item => {
  item.addEventListener('click', function() {
    const inputId = this.getAttribute('data-target');
    const inputField = document.getElementById(inputId);
    const type = inputField.getAttribute('type') === 'password' ? 'text' : 'password';
    inputField.setAttribute('type', type);
  });
});
