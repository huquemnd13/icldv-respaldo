let decodedToken; 
let cicloActivoGlobal; 
let materiaSeleccionadaId; 
let textoMateriaSeleccionada; 
let calificacionIdSeleccionada; 

window.onload = async function () {
  const token = localStorage.getItem("token"); 

  if (token) {
    try {
      decodedToken = jwt_decode(token); 
      const nombreProfesor =
        decodedToken.nombre_completo || "Campo nombre_completo no encontrado";
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

function createCalificacionDropdown(
  calificacion,
  tiempos,
  tiempoIndex,
  currentDateTime
) {
  const select = document.createElement("select");
  select.classList.add("calificacion-dropdown");

  const tiempo = tiempos[tiempoIndex];

  if (
    tiempo &&
    currentDateTime >= new Date(tiempo.fecha_inicio) &&
    currentDateTime <= new Date(tiempo.fecha_fin)
  ) {
    select.disabled = false; 
  } else {
    select.disabled = true; 
  }

  for (let i = 0; i <= 10; i++) {
    const option = document.createElement("option");
    option.value = i; 
    option.textContent = i; 
    if (calificacion === i) {
      option.selected = true; 
    } else if (!calificacion && i === 0) {
      option.selected = true; 
    }
    select.appendChild(option); 
  }

  return select; 
}
let observacionesGlobales = [];

async function cargarAlumnos() {
  const token = localStorage.getItem("token");
  if (token) {
    try {
      const gradoId = document.getElementById("grados").value;
      const cicloId = cicloActivoGlobal.id;
      const profesorId = decodedToken.id_profesor;

      if (!gradoId || !materiaSeleccionadaId || !profesorId) {
        console.error("Por favor selecciona un grado y un ciclo escolar.");
        return;
      }

      const response = await fetch(
        `/calificaciones?id_ciclo_escolar=${cicloId}&id_grado_nivel_escolar=${gradoId}&id_profesor=${profesorId}&id_materia=${materiaSeleccionadaId}`,
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

        const cellCalificacionId = document.createElement("td");
        cellCalificacionId.textContent = calificacion.id_calificacion;
        row.appendChild(cellCalificacionId);

        const cellAlumnoId = document.createElement("td");
        cellAlumnoId.textContent = calificacion.id_alumno;
        row.appendChild(cellAlumnoId);

        const cellMateria = document.createElement("td");
        cellMateria.textContent = textoMateriaSeleccionada;
        row.appendChild(cellMateria);

        const cellNombreCompleto = document.createElement("td");
        cellNombreCompleto.textContent = calificacion.nombre_completo;
        row.appendChild(cellNombreCompleto);

        const cellP1 = document.createElement("td");
        cellP1.dataset.periodo = 1;
        cellP1.appendChild(
          crearDropdown(calificacion.periodo_1, periodos[0], 1)
        );
        row.appendChild(cellP1);

        const cellP2 = document.createElement("td");
        cellP2.dataset.periodo = 2;
        cellP2.appendChild(
          crearDropdown(calificacion.periodo_2, periodos[1], 2)
        );
        row.appendChild(cellP2);

        const cellP3 = document.createElement("td");
        cellP3.dataset.periodo = 3;
        cellP3.appendChild(
          crearDropdown(calificacion.periodo_3, periodos[2], 3)
        );
        row.appendChild(cellP3);

        const cellObservacion = document.createElement("td");
        const selectObservacion = document.createElement("select");
        selectObservacion.multiple = true;
        selectObservacion.size = 6;
        selectObservacion.dataset.alumno = calificacion.id_alumno;
        selectObservacion.dataset.calificacion = calificacion.id_calificacion;

        llenarSelectConObservaciones(selectObservacion, observacionesGlobales);
        cellObservacion.appendChild(selectObservacion);
        row.appendChild(cellObservacion);

        selectObservacion.addEventListener("change", async function () {
          const selectedOptions = Array.from(selectObservacion.options).filter(
            (opt) => opt.selected
          );
          if (selectedOptions.length > 2) {
            const lastSelectedOption =
              selectedOptions[selectedOptions.length - 1];
            lastSelectedOption.selected = false;
            mostrarToast("Solo puedes seleccionar hasta 2 opciones.", "error");
          } else {
            const calificacionIdSeleccionada = parseInt(
              selectObservacion.dataset.calificacion
            );

            const observacionesSeleccionadas = selectedOptions.map(
              (opt) => opt.value
            );
            if (observacionesSeleccionadas.length > 0) {
              try {
                await guardarObservacionesSeleccionadas(
                  calificacionIdSeleccionada,
                  observacionesSeleccionadas
                );
                mostrarToast(
                  "Observaciones guardadas exitosamente.",
                  "success"
                );
              } catch (error) {
                console.error("Error al guardar observaciones:", error);
                mostrarToast("Error al guardar observaciones.", "error");
              }
            }
          }
        });

        manejarTooltip(selectObservacion);
        tableBody.appendChild(row);
      }
    } catch (error) {
      console.error("Error al cargar los alumnos:", error);
    }
  } else {
    console.error("No hay token disponible. Por favor inicia sesión.");
  }
}

// Función para obtener las observaciones desde el servidor una sola vez
async function cargarObservaciones(idMateria) {
  if (observacionesGlobales.length === 0) {
    const token = localStorage.getItem("token"); // Obtén el token del localStorage
    const response = await fetch(
      `/obtener-observaciones-materia?id_materia=${idMateria}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, // Asegúrate de que el token aquí es válido
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

// Función para llenar los select con las observaciones ya obtenidas
function llenarSelectConObservaciones(selectElement, observaciones) {
  // Llenar el select de observaciones
  observaciones.forEach((observacion, index) => {
    const option = document.createElement("option");
    option.value = observacion.id;
    option.text = `${index + 1}. ${observacion.descripcion}`; // Agregar el índice antes de la descripción
    option.dataset.descripcionLarga = observacion.descripcion_larga; // Usar un atributo personalizado
    selectElement.appendChild(option);
  });
}

// Función para guardar observaciones seleccionadas
async function guardarObservacionesSeleccionadas(
  id_calificacion,
  observaciones
) {
  const token = localStorage.getItem("token");

  // Decodifica el token para obtener el ID del usuario
  let id_usuario;
  if (token) {
    const decodedToken = JSON.parse(atob(token.split(".")[1])); // Esto es solo un ejemplo
    id_usuario = decodedToken.id; // Asegúrate de que esta propiedad exista
  }

  // Asegúrate de que las observaciones se envían como un array
  const observacionData = {
    _id_calificacion: id_calificacion, // ID de la calificación correspondiente
    _observaciones: Array.isArray(observaciones)
      ? observaciones
      : [observaciones], // Asegúrate de que siempre sea un array
    _id_usuario: id_usuario, // Asegúrate de que id_usuario esté definido
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

    // No se muestra ningún mensaje ni se pinta información en la consola
  } catch (error) {
    // No se muestra ningún mensaje ni se pinta información en la consola
  }
}

// Asegúrate de que este bloque se ejecute cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
  // Obtener todos los selects que tienen observaciones
  const selectElements = document.querySelectorAll(
    'select[id^="selectObservacion"]'
  ); // Asegúrate de que tus selects tengan un ID que empiece con "selectObservacion"

  selectElements.forEach((selectObservacion) => {
    selectObservacion.addEventListener("change", async function () {
      const selectedOptions = Array.from(selectObservacion.selectedOptions);

      // Limitar la selección a 2 opciones
      if (selectedOptions.length > 2) {
        const lastSelected = selectedOptions[selectedOptions.length - 1];
        lastSelected.selected = false; // Desmarcar la opción más reciente
        mostrarToast("Solo puedes seleccionar hasta 2 opciones.", "error"); // Mostrar mensaje de error
        return; // Salir para evitar guardar observaciones
      }

      // Obtener las observaciones seleccionadas
      const observacionesSeleccionadas = selectedOptions.map(
        (option) => option.value
      );

      // Obtener el ID de calificación directamente del dataset
      const id_calificacion = parseInt(selectObservacion.dataset.calificacion); // Asegúrate de que este dato esté disponible

      // Llama a la función para guardar las observaciones seleccionadas
      await guardarObservacionesSeleccionadas(
        id_calificacion,
        observacionesSeleccionadas
      );
    });
  });
});

// Función para crear el tooltip
function manejarTooltip(selectElement) {
  const tooltip = document.createElement("div");
  tooltip.id = "tooltip";
  tooltip.className = "tooltip";
  tooltip.style.display = "none"; // Inicialmente oculto
  document.body.appendChild(tooltip);

  // Manejo del tooltip
  selectElement.addEventListener("mouseover", (event) => {
    if (event.target.tagName === "OPTION") {
      tooltip.innerHTML = event.target.dataset.descripcionLarga; // Usar el atributo personalizado
      tooltip.style.display = "block"; // Mostrar el tooltip
      tooltip.style.left = `${event.pageX + 5}px`; // Posicionar el tooltip
      tooltip.style.top = `${event.pageY + 5}px`;
    }
  });

  selectElement.addEventListener("mousemove", (event) => {
    if (tooltip.style.display === "block") {
      tooltip.style.left = `${event.pageX + 5}px`; // Actualizar la posición del tooltip
      tooltip.style.top = `${event.pageY + 5}px`;
    }
  });

  selectElement.addEventListener("mouseout", () => {
    tooltip.style.display = "none"; // Ocultar el tooltip
  });
}

//Verificar si un periodo está activo
function esPeriodoActivo(periodo) {
  const fechaActual = new Date();
  const fechaInicio = new Date(periodo.fecha_inicio);
  const fechaFin = new Date(periodo.fecha_fin);

  // Si la fecha actual está dentro del rango del periodo, está activo
  return fechaActual >= fechaInicio && fechaActual <= fechaFin;
}

function crearDropdown(calificacionActual, periodo, periodoNumero) {
  const select = document.createElement("select");

  const calificacionesPosibles = [0, 7, 8, 9, 10]; // Opciones posibles para calificación
  calificacionesPosibles.forEach((calificacion) => {
    const option = document.createElement("option");
    option.value = calificacion;
    option.textContent = calificacion;
    option.selected = calificacion === calificacionActual;
    select.appendChild(option);
  });

  // Deshabilitar el select si el periodo no está activo
  select.disabled = !esPeriodoActivo(periodo);

  // Llamar a guardarCalificacion cuando se cambie la opción seleccionada
  select.addEventListener("change", function () {
    guardarCalificacion(this); // Pasar el elemento select modificado a la función guardarCalificacion
  });
  return select;
}

function mostrarToast(mensaje, tipo = "success") {
  const toastContainer = document.getElementById("toast-container");

  // Crear el elemento del toast
  const toast = document.createElement("div");
  toast.classList.add("toast", tipo);
  toast.textContent = mensaje;

  // Añadir el toast al contenedor
  toastContainer.appendChild(toast);

  // Hacer visible el toast
  setTimeout(() => {
    toast.classList.add("show");
  }, 100); // Pequeño retraso para activar la transición

  // Ocultar el toast después de 5 segundos
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300); // Tiempo de transición antes de eliminarlo
  }, 5000);
}

function guardarCalificacion(selectElement) {
  // Obtener el token del localStorage
  const token = localStorage.getItem("token");

  // Verificar si el token existe
  if (!token) {
    mostrarToast("No se ha encontrado el token de autorización.", "error"); // Muestra un toast de error
    return; // Salir de la función si no hay token
  }

  const idUsuario = decodedToken.id || "Campo nombre_completo no encontrado";
  const nuevaCalificacion = parseInt(selectElement.value); // Valor de la calificación seleccionada
  const idAlumno = selectElement.closest("tr").children[1].textContent; // Obtener el ID del alumno desde la fila
  calificacionIdSeleccionada = parseInt(
    selectElement.closest("tr").children[0].textContent
  ); // Obtener el ID de calificación desde la fila
  const idMateria = document.getElementById("materias").value; // Obtener el ID de la materia seleccionada
  const periodo = selectElement.parentElement.dataset.periodo; // Obtener el periodo desde el atributo data-periodo
  const campo = `p${periodo}`; // Determinar el campo dinámicamente

  fetch("/actualizar-calificaciones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`, // Usa el token de autorización aquí
    },
    body: JSON.stringify({
      _id_calificacion: calificacionIdSeleccionada, // Cambia 'id_calificacion' por '_id_calificacion'
      _campo: campo, // Cambia esto según el campo que deseas actualizar (p1, p2, p3)
      _nuevo_valor: nuevaCalificacion, // Cambia 'nuevo_valor' por '_nuevo_valor'
      _id_usuario: idUsuario, // Asegúrate de incluir el id_usuario (puedes obtenerlo del token o de otra fuente)
    }),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Error al actualizar la calificación");
      }
      return response.json();
    })
    .then((data) => {
      mostrarToast("Calificación actualizada correctamente."); // Muestra un toast de éxito
    })
    .catch((error) => {
      console.error("Error:", error);
      mostrarToast("Error al actualizar la calificación.", "error"); // Muestra un toast de error
    });
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
});
