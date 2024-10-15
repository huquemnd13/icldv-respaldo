let decodedToken;
let cicloActivoGlobal;
let materiaSeleccionadaId;

window.onload = async function () { 
  const token = getCookie("token"); // Necesitas crear una función para obtener cookies

  if (req.session && req.session.userId) {
        // La sesión es válida, continúa a la siguiente función
        return next();
    }
    // La sesión no es válida, redirige al login
    res.redirect('/login.html');

  try {
    mostrarNombreProfesor(decodedToken);
    await cargarCicloActivo(token);
    await cargarGrados(token);
  } catch (error) {
    console.error("Error al decodificar el token o cargar datos:", error); // Muestra el error en la consola
  }

  document
    .getElementById("cargar-alumnos-button")
    .addEventListener("click", cargarAlumnos);
};

// Función para obtener el valor de una cookie
function getCookie(name) {
   const value = `; ${document.cookie}`;
   const parts = value.split(`; ${name}=`);
   if (parts.length === 2) return parts.pop().split(';').shift();
}  

function mostrarNombreProfesor(tokenDecodificado) {
  const nombreProfesor =
    tokenDecodificado.nombre_completo || "Campo nombre_completo no encontrado";
  document.getElementById("nombre_usuario").textContent = nombreProfesor;
}

async function cargarCicloActivo(token) {
  const responseCiclo = await fetch("/obtener-ciclos-escolares", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (responseCiclo.ok) {
    cicloActivoGlobal = await responseCiclo.json();
    const cicloActivoSpan = document.getElementById("ciclo_activo");
    cicloActivoSpan.textContent = `Ciclo: ${cicloActivoGlobal.inicio_ciclo} - ${cicloActivoGlobal.fin_ciclo}`;
  }
}

async function cargarGrados(token) {
  const responseGrados = await fetch("/obtener-grados-profesor", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (responseGrados.ok) {
    const grados = await responseGrados.json();
    const selectGrados = document.getElementById("grados");
    // Limpiar las opciones anteriores
    selectGrados.innerHTML = "";
    // Agregar opción por defecto
    const defaultOption = document.createElement("option");
    defaultOption.value = ""; // Valor vacío
    defaultOption.textContent = "Seleccione un grado"; // Texto por defecto
    defaultOption.disabled = true; // Deshabilitar la selección
    defaultOption.selected = true; // Seleccionada por defecto
    selectGrados.appendChild(defaultOption);
    // Agregar las opciones dinámicas de los grados
    grados.forEach((grado) => {
      const option = document.createElement("option");
      option.value = grado.id;
      option.textContent = grado.descripcion;
      selectGrados.appendChild(option);
    });
    selectGrados.addEventListener("change", async (event) => {
      const gradoId = event.target.value;
      if (gradoId) {
        await cargarMaterias(token, gradoId);
      }
    });
  }
}

async function cargarMaterias(token, gradoId) {
  const response = await fetch(
    `/obtener-materias-profesor-grado?grado_id=${gradoId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.ok) {
    const materias = await response.json();
    const selectMaterias = document.getElementById("materias");
    selectMaterias.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Selecciona una materia";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    selectMaterias.appendChild(defaultOption);

    materias.forEach((materia) => {
      const option = document.createElement("option");
      option.value = materia.materia_id;
      option.textContent = materia.materia_nombre;
      selectMaterias.appendChild(option);
    });

    selectMaterias.addEventListener("change", (event) => {
      materiaSeleccionadaId = event.target.value;
    });
  }
}

async function cargarAlumnos() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const gradoId = document.getElementById("grados").value;
    const cicloId = cicloActivoGlobal.id;
    const profesorId = decodedToken.profesor_id;

    if (!gradoId || !profesorId) return;

    const calificaciones = await obtenerCalificaciones(
      cicloId,
      gradoId,
      profesorId
    );
    const periodos = await obtenerPeriodos(cicloId);
    const periodoActivo = periodos.find(esPeriodoActivo);

    if (periodoActivo) {
      mostrarToast(
        `Periodo de captura activo: Desde ${new Date(
          periodoActivo.fecha_inicio
        ).toLocaleDateString()} hasta ${new Date(
          periodoActivo.fecha_fin
        ).toLocaleDateString()}`,
        "success"
      );
    } else {
      mostrarToast(
        "No hay ningún periodo de captura activo en este momento.",
        "warning"
      );
    }

    actualizarTablaAlumnos(calificaciones, periodos);
  } catch (error) {
    // Manejar error de carga de alumnos
  }
}

async function obtenerCalificaciones(cicloId, gradoId, profesorId) {
  const response = await fetch(
    `/calificaciones?id_ciclo_escolar=${cicloId}&id_grado_nivel_escolar=${gradoId}&id_profesor=${profesorId}&id_materia=${materiaSeleccionadaId}`
  );
  return response.json();
}

async function obtenerPeriodos(cicloId) {
  const response = await fetch(`/periodos?id_ciclo_escolar=${cicloId}`);
  return response.json();
}

function actualizarTablaAlumnos(calificaciones, periodos) {
  const tableBody = document
    .getElementById("alumnos-table")
    .querySelector("tbody");
  tableBody.innerHTML = "";

  calificaciones.forEach((calificacion) => {
    const row = document.createElement("tr");

    row.innerHTML = `
                  <td>${calificacion.id_calificacion}</td>
                  <td>${calificacion.id_alumno}</td>
                  <td>${
                    document.getElementById("materias").selectedOptions[0].text
                  }</td>
                  <td>${calificacion.nombre_completo}</td>
              `;

    row.appendChild(crearCeldaDropdown(calificacion.periodo_1, periodos[0], 1));
    row.appendChild(crearCeldaDropdown(calificacion.periodo_2, periodos[1], 2));
    row.appendChild(crearCeldaDropdown(calificacion.periodo_3, periodos[2], 3));

    tableBody.appendChild(row);
  });
}

function crearCeldaDropdown(calificacionActual, periodo, periodoNumero) {
  const cell = document.createElement("td");
  cell.appendChild(crearDropdown(calificacionActual, periodo, periodoNumero));
  return cell;
}

function crearDropdown(calificacionActual, periodo, periodoNumero) {
  const select = document.createElement("select");

  const calificacionesPosibles = [0, 7, 8, 9, 10];
  calificacionesPosibles.forEach((calificacion) => {
    const option = document.createElement("option");
    option.value = calificacion;
    option.textContent = calificacion;
    option.selected = calificacion === calificacionActual;
    select.appendChild(option);
  });

  select.disabled = !esPeriodoActivo(periodo);
  select.onchange = function () {
    guardarCalificacion(this);
  };

  return select;
}

function esPeriodoActivo(periodo) {
  const fechaActual = new Date();
  const fechaInicio = new Date(periodo.fecha_inicio);
  const fechaFin = new Date(periodo.fecha_fin);
  return fechaActual >= fechaInicio && fechaActual <= fechaFin;
}

function mostrarToast(mensaje, tipo = "success") {
  const toastContainer = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.classList.add("toast", tipo);
  toast.textContent = mensaje;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 5000);
}

function guardarCalificacion(selectElement) {
  const nuevaCalificacion = selectElement.value;
  const idAlumno = selectElement.closest("tr").children[1].textContent;
  const idMateria = document.getElementById("materias").value;

  // Implementar lógica para guardar calificación
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
});
