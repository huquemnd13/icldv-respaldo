require("dotenv").config(); // Cargar variables de entorno
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const jwt = require("jsonwebtoken");

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

// Configuración de la sesión
app.use(
  session({
    secret: process.env.SESSION_SECRET || "tu_secreto_aqui", // Cambia esto por un secreto más seguro
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true }, // Cambia a true si usas HTTPS
  })
);

// Ruta para el formulario de login
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html")); // Servir el HTML de login
});

// Manejo del login
app.post("/login", async (req, res) => {
  console.log("Inicio del proceso de login");
  const { email, password } = req.body;

  // Buscar usuario en Supabase
  const { data: usuario, error } = await supabase
    .from("Usuario")
    .select("*")
    .eq("email", email)
    .single();

  if (error) {
    console.error("Error al buscar usuario:", error);
    return res.json({ success: false, message: "Error al buscar correo." });
  }

  if (usuario) {
    console.log("Usuario encontrado:", usuario);
    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, usuario.password);
    console.log("Contraseña coincide:", passwordMatch);

    if (passwordMatch) {
      // Buscar el profesor relacionado con el usuario
      console.log("ID del usuario:", usuario.id);
      const { data: profesor, error: errorProfesor } = await supabase
        .from("Profesor")
        .select("*")
        .eq("id_usuario", usuario.id)
        .single();

      if (errorProfesor) {
        console.error("Error al buscar profesor:", errorProfesor);
        return res.json({ success: false, message: "Error al buscar profesor." });
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
          process.env.JWT_SECRET || "tu_secreto_aqui", // Usar variable de entorno para la clave secreta
          { expiresIn: "1h" }
        );
        console.log("ID PROFESOR TABLA", profesor.id);
        // Responder con el token
        return res.json({ success: true, token });
      } else {
        return res.json({ success: false, message: "Profesor no encontrado." });
      }
    } else {
      console.error("Contraseña incorrecta.");
      return res.json({ success: false, message: "Contraseña incorrecta." });
    }
  }
});

// Ruta para obtener información del usuario
app.get("/get-usuario", async (req, res) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "tu_secreto_aqui");
    // Obtener el usuario a partir del token decodificado
    const { data: usuario, error: usuarioError } = await supabase
      .from("Usuario")
      .select("*")
      .eq("id", decoded.id)
      .single();

    if (usuarioError) {
      console.error("Error al obtener el usuario:", usuarioError);
    } else {
      // Si se obtuvo el usuario, busca el profesor relacionado
      const { data: profesor, error: profesorError } = await supabase
        .from("Profesor")
        .select("id")
        .eq("id_usuario", usuario.id)
        .single();

      if (profesorError) {
        console.error("Error al obtener el profesor:", profesorError);
      } else {
        const profesorId = profesor.id;
        console.log("ID del profesor:", profesorId);
        // Aquí puedes continuar con la lógica usando profesorId
      }
    }

    return res.json({ nombreUsuario: usuario.nombre_usuario });
  } catch (err) {
    console.error("Error al verificar el token:", err);
    return res.status(401).json({ message: "Token inválido" });
  }
});

// Ruta para obtener ciclos escolares activos
app.get("/ciclos-escolares", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("CicloEscolar")
      .select("*")
      .eq("activo", true);

    if (error) {
      console.error("Error al obtener ciclos escolares:", error);
      return res.status(500).json({ message: "Error al obtener ciclos escolares." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
});

// Ruta para obtener grados de un profesor
app.get("/grados-profesor/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("GradoNivelEscolar")
      .select("*")
      .eq("id_profesor", id); // Cambia esto según tu estructura de datos

    if (error) {
      console.error("Error al obtener grados del profesor:", error);
      return res.status(500).json({ message: "Error al obtener grados." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
});

// Ruta para obtener materias de un grado
app.get("/materias-grado/:gradoId", async (req, res) => {
  const { gradoId } = req.params;
  try {
    const { data, error } = await supabase
      .from("Materia")
      .select("*")
      .eq("grado_id", gradoId); // Cambia esto según tu estructura de datos

    if (error) {
      console.error("Error al obtener materias del grado:", error);
      return res.status(500).json({ message: "Error al obtener materias." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
});

// Ruta para obtener calificaciones de un alumno
app.get("/calificaciones-alumno/:alumnoId", async (req, res) => {
  const { alumnoId } = req.params;
  try {
    const { data, error } = await supabase
      .from("Calificacion")
      .select("*")
      .eq("alumno_id", alumnoId); // Cambia esto según tu estructura de datos

    if (error) {
      console.error("Error al obtener calificaciones del alumno:", error);
      return res.status(500).json({ message: "Error al obtener calificaciones." });
    }

    return res.json(data);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ message: "Error interno del servidor." });
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
