document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const notification = document.getElementById('notification');

    // Función para mostrar notificaciones
    function showNotification(message, isError = false) {
        notification.textContent = message;
        notification.className = 'notification show'; // Mostrar notificación
        if (isError) {
            notification.classList.add('error'); // Agregar clase de error
            notification.classList.remove('success'); // Asegurarse de que no tenga la clase de éxito
        } else {
            notification.classList.add('success'); // Agregar clase de éxito
            notification.classList.remove('error'); // Asegurarse de que no tenga la clase de error
        }
        // Ocultar notificación después de 3 segundos
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }


    // Manejo del formulario de inicio de sesión
    if (loginForm) {
        // Manejo del inicio de sesión
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
                    showNotification('Inicio de sesión exitoso.', false);
                    setTimeout(() => {
                        window.location.href = '/inicio.html'; // Redirige a la página de inicio
                    }, 2000);
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
