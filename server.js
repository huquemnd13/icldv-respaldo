require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const jwt = require("jsonwebtoken");
const jwtSecret = process.env.JWT_SECRET;
const helmet = require("helmet");
const moment = require("moment-timezone");
const { isAfter, addMinutes } = require("date-fns");
const { format, utcToZonedTime } = require('date-fns-tz');
const app = express();

const PDFDocument = require('pdfkit');
const { Writable } = require('stream');
const pdf = require('html-pdf');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/*
function redirectToHTTPS(req, res, next) {
  if (req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
}

app.use(redirectToHTTPS);
*/
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.glitch.global"],
      fontSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  })
);

app.use(
  helmet.hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  })
);

app.use(helmet.noSniff());
app.use(helmet.referrerPolicy({ policy: "no-referrer-when-downgrade" }));

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/styles.css", (req, res, next) => {
  res.type("text/css");
  next();
});

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), camera=(), microphone=(), fullscreen=(self), payment=()"
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: jwtSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true },
  })
);

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/login.html"));
});

function verificarToken(req, res, next) {
  // Verifica si hay un encabezado de autorización
  if (!req.headers.authorization) {
    return res.status(401).json({
      success: false,
      message: "No se proporcionó el token de autorización.",
    });
  }

  // Extrae el token del encabezado
  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token no válido o ausente.",
    });
  }

  try {
    // Verifica el token usando la clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Almacena el usuario decodificado en req.user
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Token inválido o expirado.",
    });
  }
}

// Endpoint protegido que verifica el token
app.post("/verificarToken", verificarToken, (req, res) => {
  // Si el token es válido, responde con un mensaje de éxito
  res.json({ success: true, message: "Token verificado con éxito" });
});

app.post("/login", async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const { email, password } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || !emailRegex.test(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Email inválido." });
    }

    const { data: usuario, error } = await supabase
      .from("Usuario")
      .select("*")
      .eq("email", email)
      .single();

    if (error) {
      return res
        .status(500)
        .json({ success: false, message: "Error al buscar correo." });
    }

    if (!usuario) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado." });
    }

    if (usuario.intentos_fallidos >= 3 || usuario.estatus === false) {
      return res.status(403).json({
        success: false,
        message: "Cuenta bloqueada. Contacta al administrador.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, usuario.password);

    if (passwordMatch) {
      // Convertir la hora actual a la zona horaria deseada
      const timeZone = 'America/Mexico_City';
      const zonedDate = utcToZonedTime(new Date(), timeZone);
      const formattedDate = format(zonedDate, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone });

      try {
        // Actualizar intentos_fallidos, estatus y ultimo_login
        const { error: updateError } = await supabase
          .from("Usuario")
          .update({
            intentos_fallidos: 0,
            estatus: true,
            ultimo_login: formattedDate,
          })
          .eq("id", usuario.id);

        if (updateError) {
          console.error("Error al actualizar ultimo_login:", updateError);
          return res.status(500).json({
            success: false,
            message: "Error al actualizar datos de inicio de sesión.",
          });
        }
      } catch (err) {
        console.error("Error interno al actualizar ultimo_login:", err);
        return res.status(500).json({
          success: false,
          message: "Error interno al actualizar datos de inicio de sesión.",
        });
      }
      let token;

      if (usuario.id_rol === 1) {
        token = jwt.sign(
          {
            id: usuario.id,
            id_rol: usuario.id_rol,
            nombre_completo: usuario.nombre_usuario,
          },
          process.env.JWT_SECRET,
          { algorithm: "HS256", expiresIn: "15m" }
        );
        return res.json({ success: true, token });
      } else {
        const { data: profesor, error: errorProfesor } = await supabase
          .from("Profesor")
          .select("*")
          .eq("id_usuario", usuario.id)
          .single();

        if (errorProfesor || !profesor) {
          return res
            .status(500)
            .json({ success: false, message: "Error al buscar profesor." });
        }

        const profesorId = profesor.id;
        const nombreCompleto =
          `${profesor.nombre} ${profesor.apellido_paterno} ${profesor.apellido_materno}`.trim();

        token = jwt.sign(
          {
            id: usuario.id,
            id_rol: usuario.id_rol,
            id_profesor: profesorId,
            nombre_completo: nombreCompleto,
          },
          process.env.JWT_SECRET,
          { algorithm: "HS256", expiresIn: "30m" }
        );

        return res.json({ success: true, token });
      }
    } else {
      const nuevosIntentos = (usuario.intentos_fallidos || 0) + 1;

      if (nuevosIntentos >= 3) {
        await supabase
          .from("Usuario")
          .update({ intentos_fallidos: nuevosIntentos, estatus: false })
          .eq("id", usuario.id);
        return res.status(403).json({
          success: false,
          message: "Cuenta bloqueada. Contacta al administrador.",
        });
      } else {
        await supabase
          .from("Usuario")
          .update({ intentos_fallidos: nuevosIntentos })
          .eq("id", usuario.id);
      }

      return res
        .status(401)
        .json({ success: false, message: "Contraseña incorrecta." });
    }
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
});


app.get("/grados", async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decodedToken = jwt.verify(token, jwtSecret);
    const profesorId = decodedToken.id_profesor;
    console.log(profesorId);
    const { data: grados, error } = await supabase.rpc(
      "obtener_grados_por_profesor",
      { _id_profesor: profesorId }
    );

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

    res.json(grados);
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "No autorizado." });
  }
});

app.get("/obtener-ciclos-escolares", verificarToken, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc("obtener_ciclos_escolares");

    if (error) {
      console.error("Error al obtener ciclos escolares:", error);
      return res
        .status(500)
        .json({ message: "Error al obtener ciclos escolares" });
    }

    if (data && data.length > 0) {
      const cicloActivo = data[0];
      return res.json(cicloActivo);
    } else {
      return res
        .status(404)
        .json({ message: "No hay ciclos escolares activos." });
    }
  } catch (err) {
    console.error("Error interno del servidor:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

app.get("/obtener-alumnos-grados", async (req, res) => {
  const { profesor_id, grado_id, ciclo_id } = req.query;

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

    return res.json(alumnos);
  } catch (err) {
    console.error("Error en la consulta:", err);
    return res
      .status(500)
      .json({ success: false, message: "Error en la consulta." });
  }
});

app.get("/obtener-grados-profesor", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  const decodedToken = jwt.verify(token, jwtSecret);
  const profesorId = decodedToken.id_profesor;
  console.log(profesorId);

  if (!profesorId) {
    return res
      .status(400)
      .json({ success: false, message: "Falta el parámetro profesor_id." });
  }

  try {
    const { data: grados, error } = await supabase.rpc(
      "obtener_grados_profesor",
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

app.get("/obtener-materias-profesor-grado", async (req, res) => {
  const token = req.headers.authorization.split(" ")[1];

  try {
    const decodedToken = jwt.verify(token, jwtSecret);
    const profesorId = decodedToken.id_profesor;
    const gradoId = req.query.grado_id;

    console.log("Profesor ID:", profesorId);
    console.log("Grado ID:", gradoId);

    if (!profesorId || !gradoId) {
      return res.status(400).json({
        success: false,
        message: "Faltan parámetros requeridos: profesor_id o grado_id.",
      });
    }

    const { data: materias, error } = await supabase.rpc(
      "obtener_materias_por_profesor_y_grado",
      {
        _id_profesor: profesorId,
        _id_grado_nivel_escolar: gradoId,
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

app.get("/obtener-observaciones-materia", verificarToken, async (req, res) => {
  const idMateria = req.query.id_materia;

  if (!idMateria) {
    return res.status(400).json({
      success: false,
      message: "Falta el parámetro requerido: id_materia.",
    });
  }

  try {
    const { data: observaciones, error } = await supabase
      .from("Observacion")
      .select("id, descripcion, descripcion_larga")
      .eq("id_materia", idMateria)
      .order("tipo", { ascending: false });

    if (error) {
      return res
        .status(500)
        .json({ success: false, message: "Error al obtener observaciones." });
    }

    return res.json(observaciones);
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error en la consulta." });
  }
});

app.get("/calificaciones", verificarToken, async (req, res) => {
  const { id_ciclo_escolar, id_grado_nivel_escolar, id_profesor, id_materia } =
    req.query;

  if (
    !id_ciclo_escolar ||
    !id_grado_nivel_escolar ||
    !id_profesor ||
    !id_materia
  ) {
    return res.status(400).json({ error: "Faltan parámetros requeridos." });
  }

  try {
    const { data, error } = await supabase.rpc("obtener_calificaciones", {
      ciclo_id: parseInt(id_ciclo_escolar),
      profesor_id: parseInt(id_profesor),
      grado_id: parseInt(id_grado_nivel_escolar),
      materia_id: parseInt(id_materia),
    });

    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener las calificaciones." });
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

app.get("/periodos", verificarToken, async (req, res) => {
  // Purgar el parámetro id_ciclo_escolar
  let { id_ciclo_escolar } = req.query;

  // Eliminar espacios en blanco y validar que no esté vacío
  id_ciclo_escolar = id_ciclo_escolar ? id_ciclo_escolar.trim() : "";

  if (!id_ciclo_escolar) {
    return res.status(400).json({
      success: false,
      message: "Falta el parámetro id_ciclo_escolar.",
    });
  }

  // Verificar que id_ciclo_escolar sea un número entero
  const idCicloEscolarNumber = parseInt(id_ciclo_escolar, 10);
  if (isNaN(idCicloEscolarNumber) || idCicloEscolarNumber <= 0) {
    return res.status(400).json({
      success: false,
      message: "El parámetro id_ciclo_escolar debe ser un número entero válido.",
    });
  }

  try {
    const { data: periodos, error } = await supabase
      .from("PeriodoCicloEscolar")
      .select("id, fecha_inicio, fecha_fin, periodo")
      .eq("id_ciclo_escolar", idCicloEscolarNumber) // Usar el número convertido
      .order("periodo", { ascending: true });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Error al obtener los periodos del ciclo escolar.",
      });
    }

    if (periodos.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No se encontraron periodos para el ciclo escolar especificado.",
      });
    }

    res.json(periodos);
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error interno del servidor." });
  }
});


app.post("/actualizar-calificaciones", verificarToken, async (req, res) => {
  const { _id_calificacion, _campo, _nuevo_valor, _id_usuario } = req.body;

  if (
    !_id_calificacion ||
    !_campo ||
    _nuevo_valor === undefined ||
    !_id_usuario
  ) {
    return res.status(400).json({ mensaje: "Datos incompletos" });
  }

  if (!Number.isInteger(_id_calificacion)) {
    return res
      .status(400)
      .json({ mensaje: "El ID de la calificación debe ser un número entero" });
  }

  if (!["p1", "p2", "p3"].includes(_campo)) {
    return res
      .status(400)
      .json({ mensaje: "Campo no válido, debe ser p1, p2 o p3" });
  }

  if (
    !Number.isFinite(_nuevo_valor) ||
    _nuevo_valor < 0 ||
    _nuevo_valor > 100
  ) {
    return res
      .status(400)
      .json({ mensaje: "El nuevo valor debe ser un número entre 0 y 100" });
  }

  try {
    const { data: result, error } = await supabase.rpc(
      "actualizar_calificacion",
      {
        _id_calificacion,
        _campo,
        _nuevo_valor,
        _id_usuario,
      }
    );

    if (error) {
      return res.status(500).json({
        mensaje: "Error actualizando calificación",
        error: error.message,
      });
    }

    res.status(200).json({
      mensaje: "Calificación actualizada correctamente",
      data: result,
    });
  } catch (err) {
    res
      .status(500)
      .json({ mensaje: "Error actualizando calificación", error: err.message });
  }
});

app.post("/guardar-observaciones", verificarToken, async (req, res) => {
  const { _id_calificacion, _observaciones, _id_usuario } = req.body;
  console.log(_observaciones);

  if (
    !_id_calificacion ||
    !_observaciones ||
    _observaciones.length === 0 ||
    !_id_usuario
  ) {
    return res.status(400).json({ mensaje: "Datos incompletos" });
  }

  if (!Number.isInteger(_id_calificacion)) {
    return res
      .status(400)
      .json({ mensaje: "El ID de la calificación debe ser un número entero" });
  }

  if (!Array.isArray(_observaciones) || _observaciones.length > 2) {
    return res.status(400).json({
      mensaje: "Las observaciones deben ser un array con hasta 2 elementos",
    });
  }

  try {
    const { data: result, error } = await supabase.rpc(
      "guardar_observaciones",
      {
        _id_calificacion,
        _observaciones,
        _id_usuario,
      }
    );

    if (error) {
      console.error("Error en la función RPC de Supabase:", error);
      return res.status(500).json({
        mensaje: "Error guardando observaciones",
        error: error.message,
      });
    }

    res
      .status(200)
      .json({ mensaje: "Observaciones guardadas correctamente", data: result });
  } catch (err) {
    console.error("Error general en el servidor:", err.message);
    res
      .status(500)
      .json({ mensaje: "Error guardando observaciones", error: err.message });
  }
});

app.post("/guardar-inasistencias", verificarToken, async (req, res) => {
  const { _id_alumno, _inasistencias } = req.body;
  const _id_usuario = req.user.id; // Obtiene el id del usuario del token decodificado

  console.log(_id_alumno);
  console.log(_inasistencias);
  console.log(_id_usuario);
  
  // Validación de datos
  if (!_id_alumno || _inasistencias === undefined) {
    return res.status(400).json({ mensaje: "Datos incompletos" });
  }

  if (!Number.isInteger(_id_alumno)) {
    return res.status(400).json({ mensaje: "El ID del alumno debe ser un número entero" });
  }
  
  try {
    const { data: result, error } = await supabase.rpc(
      "registrar_inasistencia",  // Nombre de la función en Supabase
      {
        _id_alumno,
        _inasistencias,
        _id_usuario,
      }
    );

    if (error) {
      console.error("Error en la función RPC de Supabase:", error);
      return res.status(500).json({ mensaje: "Error guardando inasistencias", error: error.message });
    }

    res.status(200).json({ mensaje: "Inasistencias guardadas correctamente", data: result });
  } catch (err) {
    console.error("Error general en el servidor:", err.message);
    res.status(500).json({ mensaje: "Error guardando inasistencias", error: err.message });
  }
});

// Endpoint para obtener inasistencias
app.get("/inasistencias", verificarToken, async (req, res) => {
  const { id_alumno } = req.query;

  if (!id_alumno) {
    return res.status(400).json({ message: "Falta el parámetro id_alumno" });
  }

  try {
    const { data, error } = await supabase.rpc("obtener_inasistencias", {
      id_alumno_param: parseInt(id_alumno)
    });

    if (error) {
      console.error("Error al obtener inasistencias:", error);
      return res.status(500).json({ message: "Error al obtener inasistencias" });
    }

    return res.json(data);
  } catch (err) {
    console.error("Error interno del servidor:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

app.get(
  "/reporteDetalleCalificacionesPorCiclo/:idCiclo",
  verificarToken,
  async (req, res) => {
    const { idCiclo } = req.params;

    if (req.user.id_rol !== 1) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para acceder a este recurso.",
      });
    }

    try {
      const { data, error } = await supabase.rpc(
        "obtener_calificaciones_con_promedio",
        { _id_ciclo_escolar: parseInt(idCiclo) }
      );

      if (error) {
        console.error("Error al obtener los datos:", error);
        return res.status(500).json({
          success: false,
          message: "Error al obtener los datos.",
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("Error en el servidor:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor.",
        error: error.message,
      });
    }
  }
);

// Endpoint para generar el PDF
app.get('/generar-boleta', verificarToken, async (req, res) => {
  try {
    // Recupera los datos de todos los alumnos desde Supabase
    const { data: alumnos, error } = await supabase
      .from('Alumno')
      .select('nombre, apellido_paterno, apellido_materno, curp, id_grado_nivel_escolar');

    if (error) throw error;

    // Crear el contenido HTML para las boletas
    let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Instituto Cultural Leonardo da Vinci</title>
        <link rel="stylesheet" href="style_boleta.css">
      </head>
      <body>
        <header>
          <div class="logo-container">
            <img
              class="logo"
              src="https://cdn.glitch.global/053303b6-9407-4474-b212-bccd4a7b7e5d/LogoLDV-removebg.png?v=1729718938375"
              alt="Logo del Instituto"
            />
          </div>
          <div class="bloque-azul">
            INSTITUTO CULTURAL LEONARDO DA VINCI<br />
            INFORME DE CALIFICACIONES<br />
            NIVEL PRIMARIA<br />
            CCT: 15PPR3434K
          </div>
        </header>`;

    // Agregar una boleta por cada alumno
    alumnos.forEach(alumno => {
      html += `
        <div class="tabla-contenedor">
          <table>
            <tr>
              <th>NOMBRE DEL ALUMNO</th>
              <th>CICLO ESCOLAR</th>
              <th>GRADO</th>
              <th>GRUPO</th>
              <th>PERIODO</th>
            </tr>
            <tr>
              <td>${alumno.nombre} ${alumno.apellido_paterno} ${alumno.apellido_materno}</td>
              <td>2023-2024</td>
              <td>${alumno.id_grado_nivel_escolar}</td>
              <td>B</td>
              <td>Segundo</td>
            </tr>
          </table>
          <div class="firma-container">
            <div class="firma">
              <div class="linea-firma"></div>
              <div class="firma-label">Primer Periodo</div>
            </div>
            <div class="firma">
              <div class="linea-firma"></div>
              <div class="firma-label">Segundo Periodo</div>
            </div>
            <div class="firma">
              <div class="linea-firma"></div>
              <div class="firma-label">Tercer Periodo</div>
            </div>
          </div>
          <div class="firma-indicacion">
            Firmas del padre, madre o tutor
          </div>
          <div>
            Avenida Nuestra Señora de Guadalupe, Manzana 36 Lote 146, Colonia La Guadalupana, Ecatepec de Morelos, Estado de México, C.P. 55060<br />
            Teléfonos 2607-1747 y 2607-1955
          </div>
        </div>
        <hr />
      `;
    });

    html += `</body></html>`; // Cierra el HTML

    // Establecer las opciones para el PDF
    const options = { format: 'A4' };

    // Crear el PDF
    pdf.create(html, options).toStream((err, stream) => {
      if (err) {
        console.error(err);
        res.status(500).send('Error al generar el PDF');
      } else {
        // Establecer los encabezados para la descarga del PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=boletas.pdf');
        stream.pipe(res); // Pasa el flujo del PDF a la respuesta
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al generar las boletas en PDF');
  }
});

// Ruta para actualizar la contraseña del usuario
app.post("/actualizar-contrasena", verificarToken, async (req, res) => {
  try {
    const { email, nuevaContrasena } = req.body;

    // Verificar si el rol del usuario es 1
    if (req.user.id_rol !== 1) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para actualizar contraseñas.",
      });
    }

    // Validar la estructura del correo electrónico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Correo inválido." });
    }

    // Validar que se ha proporcionado la nueva contraseña
    if (!nuevaContrasena || nuevaContrasena.length < 8) {
      return res.status(400).json({ success: false, message: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    // Buscar el usuario en la base de datos
    const { data: usuario, error } = await supabase
      .from("Usuario")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !usuario) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    // Generar el hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    // Actualizar la contraseña, estatus y intentos fallidos en la base de datos
    const { error: updateError } = await supabase
      .from("Usuario")
      .update({
        password: hashedPassword,
        estatus: true,  // Cambia el estatus a TRUE
        intentos_fallidos: 0  // Restablece intentos fallidos a 0
      })
      .eq("email", email);

    if (updateError) {
      return res.status(500).json({ success: false, message: "Error al actualizar la contraseña." });
    }

    res.json({ success: true, message: "Contraseña actualizada con éxito." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
});



const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

app.get("/status", (req, res) => {
  res.status(200).send("OK");
});

/*
const bcrypt = require('bcrypt'); // Asegúrate de tener bcrypt instalado

app.post("/register", async (req, res) => {
  try {
    console.log("Inicio del proceso de registro de usuario");
    const { nombre_usuario, email, password, id_rol } = req.body;

    // Validar que todos los campos sean proporcionados
    if (!nombre_usuario || !email || !password || !id_rol) {
      return res.status(400).json({ success: false, message: "Todos los campos son obligatorios." });
    }

    // Verificar si el email o el nombre de usuario ya están en uso
    const { data: existingUser, error: existingUserError } = await supabase
      .from("Usuario")
      .select("*")
      .or(`email.eq.${email},nombre_usuario.eq.${nombre_usuario}`)
      .single();

    if (existingUserError && existingUserError.code !== 'PGRST116') {
      console.error("Error al verificar usuario existente:", existingUserError);
      return res.status(500).json({ success: false, message: "Error al verificar usuario." });
    }

    if (existingUser) {
      return res.status(409).json({ success: false, message: "El correo electrónico o nombre de usuario ya están en uso." });
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear el nuevo usuario
    const { data: newUser, error: createUserError } = await supabase
      .from("Usuario")
      .insert([
        {
          nombre_usuario,
          email,
          password: hashedPassword,
          id_rol,
          fecha_creacion: new Date(),
          estatus: true,
          intentos_fallidos: 0
        }
      ])
      .single();

    if (createUserError) {
      console.error("Error al crear usuario:", createUserError);
      return res.status(500).json({ success: false, message: "Error al crear usuario." });
    }

    console.log("Usuario creado:", newUser);
    return res.status(201).json({ success: true, message: "Usuario registrado con éxito.", user: newUser });

  } catch (error) {
    console.error("Error en el registro:", error);
    return res.status(500).json({ success: false, message: "Error en el registro." });
  }
});
*/
