let decodedToken;
let cicloActivoGlobal;
let materiaSeleccionadaId;
let textoMateriaSeleccionada;
let calificacionIdSeleccionada;
let observacionesGlobales = [];

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

// Función para validar el token
async function verificarToken() {
    cargarToken();
    // Si el token no existe, redirige directamente a login.html
    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
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
            // Opcionalmente, puedes eliminar el token del almacenamiento local
            localStorage.removeItem('token');
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error verificando el token:", error);
        // Opcionalmente, redirige al login en caso de error de red
        window.location.href = "login.html";
    }
}

// Ejecutar la función de verificación cada cierto tiempo
setInterval(verificarToken, CHECK_INTERVAL);

// Llamada inicial para verificar el token al cargar la página
verificarToken();

window.onload = async function () {
  if (token) {
    try {
      console.log(token);
      document.getElementById("nombre_usuario").textContent = nombreProfesor;

      document
        .getElementById("cargar-alumnos-button")
        .addEventListener("click", cargarAlumnos);

      const responseCiclo = await fetch("/obtener-ciclos-escolares", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (responseCiclo.ok) {
        const cicloActivo = await responseCiclo.json();
        cicloActivoGlobal = cicloActivo;

        const cicloActivoSpan = document.getElementById("ciclo_activo");
        cicloActivoSpan.textContent = `Ciclo: ${cicloActivo.inicio_ciclo} - ${cicloActivo.fin_ciclo}`;
      } else {
        console.error("Error al obtener el ciclo escolar activo.");
      }

      const responseGrados = await fetch("/obtener-grados-profesor", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (responseGrados.ok) {
        const grados = await responseGrados.json();
        const selectGrados = document.getElementById("grados");

        grados.forEach((grado) => {
          const option = document.createElement("option");
          option.value = grado.id;
          option.textContent = grado.descripcion;
          selectGrados.appendChild(option);
        });
      } else {
        console.error("Error al obtener los grados.");
      }

      document
        .getElementById("grados")
        .addEventListener("change", async (event) => {
          const gradoId = event.target.value;
          if (gradoId) {
            try {
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

                document
                  .getElementById("materias")
                  .addEventListener("change", (event) => {
                    const selectMateria = event.target;
                    materiaSeleccionadaId = selectMateria.value;
                    textoMateriaSeleccionada =
                      selectMateria.options[selectMateria.selectedIndex].text;
                  });
              } else {
                console.error(
                  "Error al obtener materias:",
                  response.statusText
                );
              }
            } catch (err) {
              console.error("Error en la solicitud:", err);
            }
          } else {
          }
        });
    } catch (error) {
      console.error(
        "Error al decodificar el token o al obtener grados:",
        error
      );
    }
  } else {
    window.location.href = "/login.html";
  }
};

async function cargarAlumnos() {
  if (token) {
    try {
      const gradoId = document.getElementById("grados").value;
      const cicloId = cicloActivoGlobal.id;
      if (!gradoId || !materiaSeleccionadaId || !id_profesor) {
        console.error("Por favor selecciona un grado y un ciclo escolar.");
        return;
      }
      const response = await fetch(
        `/calificaciones?id_ciclo_escolar=${cicloId}&id_grado_nivel_escolar=${gradoId}&id_profesor=${id_profesor}&id_materia=${materiaSeleccionadaId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        if (response.status === 401) {
          alert("No estás autorizado. Por favor, inicia sesión nuevamente.");
          return;
        }
        throw new Error("Error al obtener las calificaciones.");
      }
      const calificaciones = await response.json();
      const responsePeriodos = await fetch(
        `/periodos?id_ciclo_escolar=${cicloId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!responsePeriodos.ok) {
        if (responsePeriodos.status === 401) {
          alert("No estás autorizado. Por favor, inicia sesión nuevamente.");
          return;
        }
        throw new Error("Error al obtener los periodos.");
      }
      const periodos = await responsePeriodos.json();
      if (observacionesGlobales.length === 0) {
        observacionesGlobales = await cargarObservaciones(materiaSeleccionadaId);
      }
      const periodoActivo = periodos.find((periodo) =>
        esPeriodoActivo(periodo)
      );
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
      const tableBody = document
        .getElementById("alumnos-table")
        .querySelector("tbody");
      tableBody.innerHTML = "";
      for (const calificacion of calificaciones) {
        const row = document.createElement("tr");
        row.appendChild(crearCelda(calificacion.id_calificacion));
        row.appendChild(crearCelda(calificacion.id_alumno));
        row.appendChild(crearCelda(textoMateriaSeleccionada));
        row.appendChild(crearCelda(calificacion.nombre_completo));
        row.appendChild(crearCeldaConDropdown(calificacion.periodo_1, periodos[0], 1));
        row.appendChild(crearCeldaConDropdown(calificacion.periodo_2, periodos[1], 2));
        row.appendChild(crearCeldaConDropdown(calificacion.periodo_3, periodos[2], 3));
        row.appendChild(crearCeldaConObservaciones(calificacion));
        row.appendChild(crearCeldaConInasistencias(calificacion));
        tableBody.appendChild(row);
      }
    } catch (error) {
      console.error("Error al cargar los alumnos:", error);
    }
  } else {
    console.error("No hay token disponible. Por favor inicia sesión.");
  }
}

function crearCelda(texto) {
  const cell = document.createElement("td");
  cell.textContent = texto;
  return cell;
}

function crearCeldaConDropdown(valor, periodo, numPeriodo) {
  const cell = document.createElement("td");
  cell.dataset.periodo = numPeriodo;
  cell.appendChild(crearDropdown(valor, periodo, numPeriodo));
  return cell;
}

function crearCeldaConObservaciones(calificacion) {
  const cell = document.createElement("td");
  const selectObservacion = document.createElement("select");
  selectObservacion.classList.add('observaciones');
  selectObservacion.multiple = true;
  selectObservacion.size = 6;
  selectObservacion.dataset.alumno = calificacion.id_alumno;
  selectObservacion.dataset.calificacion = calificacion.id_calificacion;
  llenarSelectConObservaciones(selectObservacion, observacionesGlobales);
  cell.appendChild(selectObservacion);

  selectObservacion.addEventListener("change", async function () {
    const selectedOptions = Array.from(selectObservacion.options).filter((opt) => opt.selected);
    if (selectedOptions.length > 2) {
      const lastSelectedOption = selectedOptions[selectedOptions.length - 1];
      lastSelectedOption.selected = false;
      mostrarToast("Solo puedes seleccionar hasta 2 opciones.", "error");
    } else {
      const calificacionIdSeleccionada = parseInt(selectObservacion.dataset.calificacion);
      const observacionesSeleccionadas = selectedOptions.map((opt) => opt.value);
      if (observacionesSeleccionadas.length > 0) {
        try {
          await guardarObservacionesSeleccionadas(calificacionIdSeleccionada, observacionesSeleccionadas);
          mostrarToast("Observaciones guardadas exitosamente.", "success");
        } catch (error) {
          console.error("Error al guardar observaciones:", error);
          mostrarToast("Error al guardar observaciones.", "error");
        }
      }
    }
  });

  manejarTooltip(selectObservacion);
  return cell;
}

async function crearCeldaConInasistencias(calificacion) {
  const cell = document.createElement("td");
  const selectElement = document.createElement('select');
  const id_alumno = calificacion.id_alumno;
  selectElement.classList.add('inasistencias');
  selectElement.dataset.calificacion = calificacion.id_calificacion;

  // Habilitar o deshabilitar el select según el rol del usuario
  selectElement.disabled = id_rol !== 3; // Solo habilitar si el rol es 3

  // Llenar el select con opciones de inasistencias
  for (let i = 0; i <= 20; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.text = i;
    selectElement.appendChild(option);
  }

  // Obtener inasistencias del alumno y establecer la opción seleccionada
  try {
    const response = await fetch(`/obtener-inasistencias/${id_alumno}`);
    if (response.ok) {
      const data = await response.json();
      const inasistencias = data.inasistencias || 0;
      selectElement.value = inasistencias; // Establece el valor obtenido
    } else {
      console.error('Error al obtener inasistencias:', response.statusText);
    }
  } catch (error) {
    console.error('Error al obtener inasistencias:', error);
  }

  selectElement.addEventListener('change', async function() {
    const inasistencia = selectElement.value;
    try {
      await guardarInasistencias(id_alumno, inasistencia);
    } catch (error) {
      mostrarToast(`Error al guardar inasistencias: ${error.message}`, "error");
    }
  });

  cell.appendChild(selectElement);
  return cell;
}


async function cargarObservaciones(idMateria) {
  if (observacionesGlobales.length === 0) {
    const response = await fetch(
      `/obtener-observaciones-materia?id_materia=${idMateria}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error al obtener observaciones: ${response.status}`);
    }

    observacionesGlobales = await response.json();
  }
  return observacionesGlobales;
}

function llenarSelectConObservaciones(selectElement, observaciones) {
  observaciones.forEach((observacion, index) => {
    const option = document.createElement("option");
    option.value = observacion.id;
    option.text = `${index + 1}. ${observacion.descripcion}`;
    option.dataset.descripcionLarga = observacion.descripcion_larga;
    selectElement.appendChild(option);
  });
}

async function guardarObservacionesSeleccionadas(
  id_calificacion,
  observaciones
) {
  const observacionData = {
    _id_calificacion: id_calificacion,
    _observaciones: Array.isArray(observaciones)
      ? observaciones
      : [observaciones],
    _id_usuario: id_usuario,
  };

  try {
    const response = await fetch("/guardar-observaciones", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(observacionData),
    });
  } catch (error) {}
}

async function guardarInasistencias(id_alumno, inasistencia) {
    const inasistenciaData = {
        _id_alumno: id_alumno,
        _id_usuario: id_usuario,
        _inasistencias: inasistencia,
    };

    try {
        const response = await fetch("/guardar-inasistencias", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(inasistenciaData),
        });

        if (!response.ok) {
            mostrarToast("Error al guardar inasistencias.", "error");
            throw new Error("Error al guardar inasistencias.");
        }

        const result = await response.json();
        mostrarToast("Inasistencias guardadas correctamente.", "success");
        return result;
    } catch (error) {
        mostrarToast(`Error al guardar inasistencias: ${error.message}`, "error");
        throw error;
    }
}


document.addEventListener("DOMContentLoaded", () => {
  const selectElements = document.querySelectorAll(
    'select[id^="selectObservacion"]'
  );

  selectElements.forEach((selectObservacion) => {
    selectObservacion.addEventListener("change", async function () {
      const selectedOptions = Array.from(selectObservacion.selectedOptions);

      if (selectedOptions.length > 2) {
        const lastSelected = selectedOptions[selectedOptions.length - 1];
        lastSelected.selected = false;
        mostrarToast("Solo puedes seleccionar hasta 2 opciones.", "error");
        return;
      }

      const observacionesSeleccionadas = selectedOptions.map(
        (option) => option.value
      );

      const id_calificacion = parseInt(selectObservacion.dataset.calificacion);

      await guardarObservacionesSeleccionadas(
        id_calificacion,
        observacionesSeleccionadas
      );
    });
  });
});

function crearDropdown(calificacionActual, periodo, periodoNumero) {
  const select = document.createElement("select");
  select.classList.add("calificaciones");

  const calificacionesPosibles = [0, 7, 8, 9, 10];
  calificacionesPosibles.forEach((calificacion) => {
    const option = document.createElement("option");
    option.value = calificacion;
    option.textContent = calificacion;
    option.selected = calificacion === calificacionActual;
    select.appendChild(option);
  });

  select.disabled = !esPeriodoActivo(periodo);

  select.addEventListener("change", function () {
    guardarCalificacion(this);
  });
  return select;
}

function guardarCalificacion(selectElement) {
  const nuevaCalificacion = parseInt(selectElement.value);
  const idAlumno = selectElement.closest("tr").children[1].textContent;
  calificacionIdSeleccionada = parseInt(
    selectElement.closest("tr").children[0].textContent
  );
  const idMateria = document.getElementById("materias").value;
  const periodo = selectElement.parentElement.dataset.periodo;
  const campo = `p${periodo}`;

  fetch("/actualizar-calificaciones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      _id_calificacion: calificacionIdSeleccionada,
      _campo: campo,
      _nuevo_valor: nuevaCalificacion,
      _id_usuario: id_usuario,
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Error al actualizar la calificación");
      }
      return response.json();
    })
    .then((data) => {
      mostrarToast("Calificación actualizada correctamente.");
    })
    .catch((error) => {
      console.error("Error:", error);
      mostrarToast("Error al actualizar la calificación.", "error");
    });
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

function manejarTooltip(selectElement) {
  const tooltip = document.createElement("div");
  tooltip.id = "tooltip";
  tooltip.className = "tooltip";
  tooltip.style.display = "none";
  document.body.appendChild(tooltip);

  selectElement.addEventListener("mouseover", (event) => {
    if (event.target.tagName === "OPTION") {
      tooltip.innerHTML = event.target.dataset.descripcionLarga;
      tooltip.style.display = "block";
      tooltip.style.left = `${event.pageX + 5}px`;
      tooltip.style.top = `${event.pageY + 5}px`;
    }
  });

  selectElement.addEventListener("mousemove", (event) => {
    if (tooltip.style.display === "block") {
      tooltip.style.left = `${event.pageX + 5}px`;
      tooltip.style.top = `${event.pageY + 5}px`;
    }
  });

  selectElement.addEventListener("mouseout", () => {
    tooltip.style.display = "none";
  });
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
