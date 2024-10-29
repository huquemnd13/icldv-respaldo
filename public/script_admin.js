
let token;
let id_usuario;
let id_rol;
let nombreProfesor;
let id_profesor;

const CHECK_INTERVAL = 70000;

function cargarToken() {
    token = localStorage.getItem("token");
    if (token) {
        const decodedToken = JSON.parse(atob(token.split(".")[1]));
        id_usuario = decodedToken.id;      // ID del usuario
        id_rol = decodedToken.id_rol; // Asumiendo que el rol se almacena en 'id_rol'
        nombreProfesor = decodedToken.nombre_completo || "Campo nombre_completo no encontrado";
        id_profesor = decodedToken.id_profesor;
    }
}

// Función para decodificar el token JWT
function decodificarToken(token) {
    const payload = token.split('.')[1]; // Obtener la parte del payload
    const decoded = JSON.parse(atob(payload)); // Decodificar y parsear
    return decoded;
}

// Función para validar el token
async function verificarToken() {
    // Si el token no existe, redirige directamente a login.html
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        // Decodificar el token para obtener el id_rol
        const decodedToken = decodificarToken(token);
        id_rol = decodedToken.id_rol; // Asumiendo que el id_rol está en el payload

        // Verificar si el rol es 2 o 3
        if (id_rol !== 2 && id_rol !== 3) {
            localStorage.removeItem('token'); // Opcional: Eliminar el token
            window.location.href = "login.html"; // Redirigir a login
            return;
        }

        // Realiza la solicitud al endpoint de verificación de token
        const response = await fetch('/verificarToken', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Si el token es inválido o ha expirado, redirige al usuario
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token'); // Opcional: Eliminar el token
            window.location.href = "login.html"; // Redirigir a login
        }
    } catch (error) {
        console.error("Error verificando el token:", error);
        // Opcionalmente, redirige al login en caso de error de red
        window.location.href = "login.html";
    }
}


// Ejecutar la función de verificación cada cierto tiempo
setInterval(verificarToken, CHECK_INTERVAL);
window.onload = function () {
  cargarToken();
  verificarToken();
  if (isTokenExpired(token)) {
    alert("La sesión ha expirado. Por favor, inicia sesión nuevamente.");
    logout();
    return;
  }

  try {
    const decodedToken = jwt_decode(token);
    if (decodedToken && decodedToken.nombre_completo) {
      document.getElementById("nombre_usuario").textContent =
        decodedToken.nombre_completo;
    } else {
      document.getElementById("nombre_usuario").textContent = "Invitado";
    }
  } catch (error) {
    document.getElementById("nombre_usuario").textContent = "Invitado";
  }

  const idCiclo = 1;
  obtenerDatosCalificaciones(idCiclo);
};

async function obtenerDatosCalificaciones(idCiclo) {
  try {
    const response = await fetch(
      `/reporteDetalleCalificacionesPorCiclo/${idCiclo}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Error al obtener los datos: " + response.statusText);
    }

    const data = await response.json();
    mostrarDatosEnTabla(data.data);
  } catch (error) {}
}

function mostrarDatosEnTabla(datos) {
  const tbody = document.getElementById("tbodyCalificaciones");
  tbody.innerHTML = "";

  datos.forEach((item) => {
    const row = document.createElement("tr");
    if (item.nombre_materia === "-- PROMEDIO --") {
      row.classList.add("promedio-row");
    }

    row.innerHTML = `
                    <td>${item.nombre_completo_alumno}</td>
                    <td>${item.curp}</td>
                    <td>${item.ciclo_escolar}</td>
                    <td>${item.grado_escolar}</td>
                    <td>${item.descripcion_campo_formativo}</td>
                    <td>${item.nombre_materia}</td>
                    <td>${item.p1}</td>
                    <td>${item.p2}</td>
                    <td>${item.p3}</td>
                `;
    tbody.appendChild(row);
  });
}

function exportarATablaExcel() {
  const wb = XLSX.utils.table_to_book(
    document.getElementById("tablaCalificaciones"),
    { sheet: "Calificaciones" }
  );
  XLSX.writeFile(wb, "reporte_calificaciones.xlsx");
}

function isTokenExpired(token) {
  const decodedToken = jwt_decode(token);
  return decodedToken.exp * 1000 < Date.now();
}

function logout() {
  localStorage.removeItem("token");
  window.location.href = "/login.html";
}

document.addEventListener("DOMContentLoaded", function () {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  const exportButton = document.getElementById("export-button");
  if (exportButton) {
    exportButton.addEventListener("click", exportarATablaExcel);
  }
});
