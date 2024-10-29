let token = localStorage.getItem("token");
window.onload = function () {
  if (!token) {
    document.getElementById("nombre_usuario").textContent = "Invitado";
    window.location.href = "login.html";
    return;
  }

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
