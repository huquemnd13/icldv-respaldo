window.onload = function () {
  const token = localStorage.getItem("token");
  if (!token) {
    
    document.getElementById("nombre_usuario").textContent = "Invitado";
    // Redirigir a login.html
    window.location.href = "login.html";
    return;
  }

  try {
    // Decodificamos el token usando jwt_decode
    const decodedToken = jwt_decode(token);
    
    // Mostramos el nombre del usuario en la pantalla
    if (decodedToken && decodedToken.nombre_completo) {
      document.getElementById("nombre_usuario").textContent =
        decodedToken.nombre_completo;
    } else {
      document.getElementById("nombre_usuario").textContent = "Invitado";
    }
  } catch (error) {
    document.getElementById("nombre_usuario").textContent = "Invitado";
  }

  const idCiclo = 1; // Cambia esto al ID del ciclo que quieras cargar
  obtenerDatosCalificaciones(idCiclo);
};

async function obtenerDatosCalificaciones(idCiclo) {
  const token = localStorage.getItem("token");
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
    mostrarDatosEnTabla(data.data); // Llama a la función para mostrar los datos
  } catch (error) {
    
  }
}

function mostrarDatosEnTabla(datos) {
  const tbody = document.getElementById("tbodyCalificaciones");
  tbody.innerHTML = ""; // Limpiar tabla antes de llenar

  datos.forEach((item) => {
    const row = document.createElement("tr");

    // Verificar si la materia es -- PROMEDIO -- y agregar la clase
    if (item.nombre_materia === "-- PROMEDIO --") {
      row.classList.add("promedio-row"); // Agregar la clase si es promedio
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

// Función para manejar el cierre de sesión
function logout() {
  localStorage.removeItem("token"); // Elimina el token de localStorage
  window.location.href = "/login.html"; // Redirige al usuario a la página de inicio de sesión
}

document.addEventListener("DOMContentLoaded", function () {
  // Maneja el cierre de sesión
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", logout); // Llama a la función de cierre de sesión
  }

  // Botón para exportar a Excel
  const exportButton = document.getElementById("export-button");
  if (exportButton) {
    exportButton.addEventListener("click", exportarATablaExcel); // Llama a la función de exportación
  }
});
