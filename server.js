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

// Manejo del login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Buscar usuario en Supabase
  const { data: usuario, error } = await supabase
    .from("Usuario")
    .select("*")
    .eq("email", email)
    .single(); // Obtiene un único usuario

  if (error) {
    return res.json({ success: false, message: "Error al buscar correo." });
  }

  if (usuario) {
    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, usuario.password);

    if (passwordMatch) {
      // Buscar el profesor relacionado con el usuario
      const { data: profesor, error: errorProfesor } = await supabase
        .from("Profesor")
        .select("*")
        .eq("id_usuario", usuario.id) // Suponiendo que id_usuario en Profesor relaciona con id en Usuario
        .single();

      if (errorProfesor) {
        return res.json({
          success: false,
          message: "Error al buscar profesor.",
        });
      }

      if (profesor) {
        // Generar el nombre completo del profesor
        const nombreCompleto = `${profesor.nombre} ${profesor.apellido_paterno} ${profesor.apellido_materno}`;

        // Generar un token JWT con el nombre completo del profesor
        const token = jwt.sign(
          {
            id: usuario.id,
            nombre_completo: nombreCompleto,
            profesor_id: profesor.id,
          },
          jwtSecret,
          { expiresIn: "1h" }
        );
        // Responder con el token
        return res.json({ success: true, token }); // Envía el token al cliente
      } else {
        return res.json({ success: false, message: "Profesor no encontrado." });
      }
    } else {
      return res.json({ success: false, message: "Contraseña incorrecta." });
    }
  }
});

// Manejo del usuario
app.get("/get-usuario", async (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Asegúrate de obtener el token del encabezado

  if (!token) {
    return res.status(401).json({ message: "No autorizado" }); // Si no hay token, responde con un error 401
  }

  try {
    const decoded = jwt.verify(token, jwtSecret); // Verifica el token
    // Obtener el usuario a partir del token decodificado
    const { data: usuario, error: usuarioError } = await supabase
      .from("Usuario")
      .select("*")
      .eq("id", decoded.id) // Usa el ID del token para obtener el usuario
      .single();

    if (usuarioError) {
    } else {
      // Si se obtuvo el usuario, busca el profesor relacionado
      const { data: profesor, error: profesorError } = await supabase
        .from("Profesor")
        .select("id") // Selecciona el campo 'id' de la tabla Profesor
        .eq("id_usuario", usuario.id) // Usa 'id_usuario' para buscar el profesor relacionado
        .single();

      if (profesorError) {
      } else {
        const profesorId = profesor.id; // Ahora tienes el ID del profesor
        // Aquí puedes continuar con la lógica usando profesorId
      }
    }

    return res.json({ nombreUsuario: usuario.nombre_usuario }); // Responde con el nombre de usuario
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
});

app.get("/grados", async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header
    const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
    const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor

    // Obtener los grados y descripciones del nivel escolar para un profesor específico
    const { data: grados, error } = await supabase.rpc(
      "obtener_grados_por_profesor",
      { _id_profesor: profesorId }
    ); // Llamamos a la función con el ID del profesor

    if (error) {
      return res.status(500).json({
        message:
          "Error al obtener los grados y descripciones del nivel escolar.",
      });
    }

    // Enviar el resultado en la respuesta
    res.json(grados);
  } catch (error) {
    res.status(401).json({ message: "No autorizado." });
  }
});

// API PARA LLENAR EL CICLO ESCOLAR DEL HEADER EN INICIO
app.get("/obtener-ciclos-escolares", async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("obtener_ciclos_escolares");

    if (error) {
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
      return res
        .status(500)
        .json({ success: false, message: "Error al obtener alumnos." });
    }

    return res.json(alumnos); // Retornar los datos de alumnos
  } catch (err) {
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
    res.status(500).json({ error: "Error en el servidor." });
  }
});*/

// ESTO LLEVA LA INFORMACION DE LOS GRADOS ASIGNADOS DEL PROFESOR PARA EL DROP DOWN LIST
app.get("/obtener-grados-profesor", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header
  const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
  const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor

  try {
    // Obtener los grados para el profesor
    const { data: grados, error } = await supabase
      .from("GradoNivelEscolar")
      .select("id, descripcion")
      .eq("id_profesor", profesorId); // Filtrar por ID del profesor

    if (error) {
      return res.status(500).json({ error: "Error al obtener grados." });
    }

    return res.json(grados); // Devolver los grados en formato JSON
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor." });
  }
});

// API para obtener materias de un grado específico
app.get("/materias-grado/:gradoId", async (req, res) => {
  const { gradoId } = req.params; // Obtener el ID del grado de los parámetros

  try {
    const { data, error } = await supabase
      .from("Materia")
      .select("*")
      .eq("id_grado_nivel_escolar", gradoId); // Filtrar por ID del grado

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error al obtener las materias.",
      });
    }

    return res.json(data); // Devolver las materias en formato JSON
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error en el servidor." });
  }
});

// API para obtener la calificación de un alumno en una materia
app.get("/calificacion", async (req, res) => {
  const { id_alumno, id_materia, id_ciclo_escolar, id_grado_nivel_escolar } =
    req.query;

  try {
    const { data, error } = await supabase
      .from("Calificacion")
      .select("*")
      .eq("id_alumno", id_alumno)
      .eq("id_materia", id_materia)
      .eq("id_ciclo_escolar", id_ciclo_escolar)
      .eq("id_grado_nivel_escolar", id_grado_nivel_escolar)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error al obtener la calificación.",
      });
    }

    return res.json(data); // Devolver la calificación en formato JSON
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error en el servidor." });
  }
});

// API para actualizar calificaciones
app.put("/actualizar-calificacion", async (req, res) => {
  const { id, id_ciclo_escolar, id_grado_nivel_escolar, id_materia, p1, p2, p3 } =
    req.body;

  try {
    const { data, error } = await supabase
      .from("Calificacion")
      .update({
        id_ciclo_escolar: id_ciclo_escolar,
        id_grado_nivel_escolar: id_grado_nivel_escolar,
        id_materia: id_materia,
        p1: p1,
        p2: p2,
        p3: p3,
      })
      .eq("id", id); // Actualizar la calificación por ID

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error al actualizar la calificación.",
      });
    }

    return res.json(data); // Devolver los datos actualizados
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error en el servidor." });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000; // Asignar el puerto del entorno o usar 3000 por defecto
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`); // Mensaje que indica que el servidor está en funcionamiento
});
