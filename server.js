
require("dotenv").config(); // Cargar variables de entorno
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const path = require("path"); // Importar el módulo path
const jwt = require("jsonwebtoken"); // Asegúrate de instalar jsonwebtoken con npm
const jwtSecret = process.env.JWT_SECRET;

const app = express();

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL; // Cargar URL de Supabase desde la variable de entorno
const supabaseKey = process.env.SUPABASE_KEY; // Cargar clave de Supabase desde la variable de entorno
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Forzar el tipo MIME de CSS
app.use("/styles.css", (req, res, next) => {
  res.type("text/css");
  next();
});

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: jwtSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }, 
  })
);

// Ruta para el formulario de login
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html")); // Servir el HTML de login
});

// Middleware para validar el token JWT
const validarToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Obtener el token del encabezado

  if (!token) {
    return res.status(401).json({ message: "No autorizado, token no proporcionado" });
  }

  // Verificar el token
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token no válido", error: err.message });
    }

    // Si el token es válido, se puede acceder a los datos decodificados
    req.user = decoded; // Guarda la información del usuario en el objeto de solicitud
    next(); // Llama al siguiente middleware o ruta
  });
};

// Manejo del login
app.post("/login", async (req, res) => {
  console.log("Inicio del proceso de login"); // Mensaje inicial
  const { email, password } = req.body;

  // Buscar usuario en Supabase
  const { data: usuario, error } = await supabase
    .from("Usuario")
    .select("*")
    .eq("email", email)
    .single(); // Obtiene un único usuario

  if (error) {
    console.error("Error al buscar usuario:", error); // Log de error
    return res.json({ success: false, message: "Error al buscar correo." });
  }

  if (usuario) {
    console.log("Usuario encontrado:", usuario); // Agrega esto para verificar si se encontró el usuario
    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, usuario.password);
    console.log("Contraseña coincide:", passwordMatch); // Log del resultado de comparación

    if (passwordMatch) {
      // Buscar el profesor relacionado con el usuario
      console.log("ID del usuario:", usuario.id); // Agrega esta línea para imprimir el ID del usuario
      const { data: profesor, error: errorProfesor } = await supabase
        .from("Profesor")
        .select("*")
        .eq("id_usuario", usuario.id) // Suponiendo que id_usuario en Profesor relaciona con id en Usuario
        .single();

      if (errorProfesor) {
        console.error("Error al buscar profesor:", errorProfesor);
        return res.json({
          success: false,
          message: "Error al buscar profesor.",
        });
      }

      if (profesor) {
        // Generar el nombre completo del profesor
        const nombreCompleto = `${profesor.nombre} ${profesor.apellido_paterno} ${profesor.apellido_materno}`;

        // Generar un token JWT
        const token = jwt.sign(
          {
            id: usuario.id,               // ID del usuario
            id_rol: usuario.id_rol,       // Rol del usuario
            iat: Math.floor(Date.now() / 1000),  // Fecha de emisión
          },
          jwtSecret,
          { expiresIn: "1h" }  // Esto maneja la expiración
        );

        console.log("ID PROFESOR TABLA", profesor.id);
        // Responder con el token
        return res.json({ success: true, token }); // Envía el token al cliente
      } else {
        return res.json({ success: false, message: "Profesor no encontrado." });
      }
    } else {
      console.error("Contraseña incorrecta.");
      return res.json({ success: false, message: "Contraseña incorrecta." });
    }
  }
});

app.get("/grados", async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header
    const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
    const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor
    console.log(profesorId);
    // Obtener los grados y descripciones del nivel escolar para un profesor específico
    const { data: grados, error } = await supabase.rpc(
      "obtener_grados_por_profesor",
      { _id_profesor: profesorId }
    ); // Llamamos a la función con el ID del profesor

    if (error) {
      console.error(
        "Error al ejecutar la función obtener_grados_por_profesor:",
        error
      );
      return res.status(500).json({
        message:
          "Error al obtener los grados y descripciones del nivel escolar.",
      });
    }

    // Enviar el resultado en la respuesta
    res.json(grados);
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "No autorizado." });
  }
});

// API PARA LLENAR EL CICLO ESCOLAR DEL HEADER EN INICIO
app.get("/obtener-ciclos-escolares", validarToken, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("obtener_ciclos_escolares");

    if (error) {
      console.error("Error al obtener ciclos escolares:", error);
      return res
        .status(500)
        .json({ message: "Error al obtener ciclos escolares" });
    }

    // Asegurarte de que data contenga un solo ciclo escolar activo
    if (data && data.length > 0) {
      const cicloActivo = data[0]; // Obtener el primer ciclo que es el activo
      return res.json(cicloActivo); // Enviar el ciclo activo como respuesta
    } else {
      return res
        .status(404)
        .json({ message: "No hay ciclos escolares activos." }); // Manejo de caso sin ciclos activos
    }
  } catch (err) {
    console.error("Error interno del servidor:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// Ruta para obtener alumnos por grado
app.get("/obtener-alumnos-grados", async (req, res) => {
  const { profesor_id, grado_id, ciclo_id } = req.query; // Obtener los parámetros de la consulta

  try {
    const { data: alumnos, error } = await supabase.rpc(
      "obtener_alumnos_por_grado",
      {
        profesor_id: profesor_id,
        grado_id: grado_id,
        ciclo_id: ciclo_id,
      }
    );

    if (error) {
      console.error("Error al obtener alumnos:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error al obtener alumnos." });
    }

    return res.json(alumnos); // Retornar los datos de alumnos
  } catch (err) {
    console.error("Error en la consulta:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error en la consulta." });
  }
});

/*DESUSO
// API para obtener fechas del ciclo escolar
app.get("/obtener-fechas-ciclo", async (req, res) => {
  const { ciclo_id } = req.query;

  try {
    const { data, error } = await supabase
      .from("TiempoCicloEscolar")
      .select("fecha_inicio, fecha_fin, tiempo") // Ahora incluye el campo 'tiempo'
      .eq("id_ciclo_escolar", ciclo_id)
      .order("tiempo", { ascending: true }); // Ordenar por 'tiempo' en orden ascendente

    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener las fechas del ciclo escolar." });
    }

    res.json(data);
  } catch (error) {
    console.error("Error al ejecutar la consulta:", error);
    res.status(500).json({ error: "Error en el servidor." });
  }
});*/

// ESTO LLEVA LA INFORMACION DE LOS GRADOS ASIGNADOS DEL PROFESOR PARA EL DROP DOWN LIST
app.get("/obtener-grados-profesor", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header
  const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
  const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor
  console.log(profesorId);

  if (!profesorId) {
    return res
      .status(400)
      .json({ success: false, message: "Falta el parámetro profesor_id." });
  }

  try {
    const { data: grados, error } = await supabase.rpc(
      "obtener_descripciones_grados_por_profesor",
      {
        _id_profesor: profesorId,
      }
    );

    if (error) {
      console.error("Error al obtener grados:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error al obtener grados." });
    }

    return res.json(grados);
  } catch (err) {
    console.error("Error en la consulta:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error en la consulta." });
  }
});

// ESTO LLEVA LA INFORMACION DE LAS MATERIAS ASIGNADAS AL PROFESOR PARA EL DROP DOWN LIST
app.get("/obtener-materias-profesor-grado", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header

  try {
    const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
    const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor
    const gradoId = req.query.grado_id; // Obtener el ID del grado desde los parámetros de la consulta

    console.log("Profesor ID:", profesorId);
    console.log("Grado ID:", gradoId);

    // Verificar que ambos IDs estén presentes
    if (!profesorId || !gradoId) {
      return res.status(400).json({
        success: false,
        message: "Faltan parámetros requeridos: profesor_id o grado_id.",
      });
    }

    // Llamar a la función en Supabase
    const { data: materias, error } = await supabase.rpc(
      "obtener_materias_por_profesor_y_grado",
      {
        _id_profesor: profesorId,
        _id_grado_nivel_escolar: gradoId, // Pasar el ID del grado desde el dropdown
      }
    );

    if (error) {
      console.error("Error al obtener materias:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error al obtener materias." });
    }

    return res.json(materias);
  } catch (err) {
    console.error("Error en la consulta:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error en la consulta." });
  }
});

// Endpoint para obtener detalles de calificaciones
app.get("/calificaciones", async (req, res) => {
  const { id_ciclo_escolar, id_grado_nivel_escolar, id_profesor, id_materia } =
    req.query;

  // Valida que se hayan pasado todos los parámetros
  if (
    !id_ciclo_escolar ||
    !id_grado_nivel_escolar ||
    !id_profesor ||
    !id_materia
  ) {
    return res.status(400).json({ error: "Faltan parámetros requeridos." });
  }

  try {
    console.log("Parámetros recibidos:", {
      id_ciclo_escolar,
      id_grado_nivel_escolar,
      id_profesor,
      id_materia,
    });

    // Llama a la función de la base de datos
    const { data, error } = await supabase.rpc("obtener_calificaciones", {
      ciclo_id: parseInt(id_ciclo_escolar), // Asegúrate de que estos valores son correctos
      profesor_id: parseInt(id_profesor),
      grado_id: parseInt(id_grado_nivel_escolar),
      materia_id: parseInt(id_materia),
    });

    if (error) {
      console.error("Error al obtener las calificaciones:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener las calificaciones." });
    }

    console.log("Datos obtenidos:", data);

    // Devuelve los resultados como respuesta
    res.status(200).json(data);
  } catch (err) {
    console.error("Error en la solicitud al servidor:", err);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Endpoint para obtener los periodos de un ciclo escolar por su ID
app.get("/periodos", async (req, res) => {
  const { id_ciclo_escolar } = req.query; // Obtener el parámetro id_ciclo_escolar de la query

  if (!id_ciclo_escolar) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Falta el parámetro id_ciclo_escolar.",
      });
  }

  try {
    // Realizar la consulta a la tabla PeriodoCicloEscolar
    const { data: periodos, error } = await supabase
        .from("PeriodoCicloEscolar")
        .select("id, fecha_inicio, fecha_fin, periodo")
        .eq("id_ciclo_escolar", id_ciclo_escolar)
        .order("periodo", { ascending: true }); // Ordenar por la columna 'periodo' en orden ascendente


    if (error) {
      console.error("Error al obtener los periodos:", error);
      return res
        .status(500)
        .json({
          success: false,
          message: "Error al obtener los periodos del ciclo escolar.",
        });
    }

    // Verificar si se encontraron periodos
    if (periodos.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "No se encontraron periodos para el ciclo escolar especificado.",
        });
    }

    // Retornar los periodos en la respuesta
    res.json(periodos);
  } catch (err) {
    console.error("Error interno del servidor:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
});

app.post('/actualizar-calificaciones', async (req, res) => {
    const { _id_calificacion, _campo, _nuevo_valor, _id_usuario } = req.body; // Obtener id_usuario del cuerpo

    // Validaciones de entrada
    if (!_id_calificacion || !_campo || _nuevo_valor === undefined || !_id_usuario) {
        return res.status(400).json({ mensaje: 'Datos incompletos' });
    }

    if (!Number.isInteger(_id_calificacion)) {
        return res.status(400).json({ mensaje: 'El ID de la calificación debe ser un número entero' });
    }

    if (!['p1', 'p2', 'p3'].includes(_campo)) {
        return res.status(400).json({ mensaje: 'Campo no válido, debe ser p1, p2 o p3' });
    }

    if (!Number.isFinite(_nuevo_valor) || _nuevo_valor < 0 || _nuevo_valor > 100) {
        return res.status(400).json({ mensaje: 'El nuevo valor debe ser un número entre 0 y 100' });
    }

    try {
        // Llamar a la función RPC de Supabase
        const { data: result, error } = await supabase.rpc('actualizar_calificacion', {
            _id_calificacion,
            _campo,
            _nuevo_valor,
            _id_usuario
        });

        if (error) {
            console.error('Error en la función RPC de Supabase:', error); // Log detallado
            return res.status(500).json({ mensaje: 'Error actualizando calificación', error: error.message });
        }

        res.status(200).json({ mensaje: 'Calificación actualizada correctamente', data: result });
    } catch (err) {
        console.error('Error general en el servidor:', err.message); // Log detallado
        res.status(500).json({ mensaje: 'Error actualizando calificación', error: err.message });
    }
});






// Redirige a login.html cuando el usuario visita la raíz del sitio (/)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/login.html"));
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`); // Usa comillas invertidas para interpolar
});