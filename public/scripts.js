window.onload = function() {
    localStorage.clear();
};

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const notification = document.getElementById('notification');

    function showNotification(message, isError = false) {
        notification.textContent = message;
        notification.className = 'notification show';
        if (isError) {
            notification.classList.add('error');
            notification.classList.remove('success');
        } else {
            notification.classList.add('success');
            notification.classList.remove('error');
        }
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (data.success) {
                    // Almacenar el token en localStorage
                    localStorage.setItem("token", data.token);
                    
                    // Decodificar el token y obtener el rol del usuario
                    const decodedToken = jwt_decode(data.token);
                    const userRole = decodedToken.id_rol; // Obtener el id del rol

                    // Redirigir según el rol del usuario
                    if (userRole === 1) {
                        showNotification('Inicio de sesión exitoso.', false);
                        setTimeout(() => {
                            window.location.href = '/administracion.html'; // Rol 1 para administración
                        }, 2000);
                    } else if (userRole === 2) {
                        showNotification('Inicio de sesión exitoso.', false);
                        setTimeout(() => {
                            window.location.href = '/inicio.html'; // Rol 2 para usuarios normales
                        }, 2000);
                    } else {
                        showNotification('Rol de usuario no reconocido.', true);
                    }

                } else {
                    showNotification(data.message, true);
                }

            } catch (error) {
                console.error('Error:', error);
                showNotification('Ocurrió un error en el inicio de sesión. Intenta de nuevo.', true);
            }
        });
    }

});
