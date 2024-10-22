
require("dotenv").config(); // Cargar variables de entorno
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");
const path = require("path"); // Importar el módulo path
const jwt = require("jsonwebtoken"); // Asegúrate de instalar jsonwebtoken con npm
const jwtSecret = process.env.JWT_SECRET;
const helmet = require('helmet');

const moment = require('moment-timezone'); // Importa moment-timezone

const { isAfter, addMinutes } = require('date-fns');

const app = express();

const supabaseUrl = process.env.SUPABASE_URL; // Cargar URL de Supabase desde la variable de entorno
const supabaseKey = process.env.SUPABASE_KEY; // Cargar clave de Supabase desde la variable de entorno
const supabase = createClient(supabaseUrl, supabaseKey);

// Configura la política de seguridad de contenido
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"], // Agregado CDN aquí
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      imgSrc: [
        "'self'", 
        "data:", 
        "https://cdn.glitch.global" // Permite cargar imágenes desde este CDN
      ],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
      // reportUri: '/csp-violation-report-endpoint' // Habilita el informe de violaciones si es necesario
    },
  })
);

// Configura la política HSTS
app.use(
  helmet.hsts({
    maxAge: 31536000, // 1 año en segundos
    includeSubDomains: true, // Incluir subdominios
    preload: true, // Permite el uso en la lista de precarga HSTS
  })
);

// Configura la política X-Content-Type-Options
app.use(helmet.noSniff());

// Configura la política de referencia Referrer Policy
app.use(helmet.referrerPolicy({ policy: 'no-referrer-when-downgrade' }));


// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Forzar el tipo MIME de CSS
app.use("/styles.css", (req, res, next) => {
  res.type("text/css");
  next();
});

// Establecer la Política de Permisos
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), fullscreen=(self), payment=()");
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

// Middleware para verificar el token
function verificarToken(req, res, next) {
    if (!req.headers.authorization) {
        return res.status(401).json({
            success: false,
            message: "No se proporcionó el token de autorización.",
        });
    }

    const token = req.headers.authorization.split(" ")[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Token no válido o ausente.",
        });
    }

    try {
        // Verificar el token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Guardar los datos del usuario en req.user para usarlos después si es necesario
        req.user = decoded;
        
        next(); // Continuar con la ejecución de la ruta
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: "Token inválido o expirado.",
        });
    }
}

app.post("/login", async (req, res) => {
  try {
    console.log("Inicio del proceso de login");
    const { email, password } = req.body;

    // Validación de entrada
    // 1. Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Email inválido." });
    }

    // Buscar usuario en Supabase
    const { data: usuario, error } = await supabase
      .from("Usuario")
      .select("*")
      .eq("email", email)
      .single();

    if (error) {
      console.error("Error al buscar usuario:", error);
      return res.status(500).json({ success: false, message: "Error al buscar correo." });
    }

    if (!usuario) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado." });
    }

    console.log("Usuario encontrado:", usuario);

    // Comprobar si el usuario está bloqueado
    if (usuario.intentos_fallidos >= 3 || usuario.estatus === false) {
      return res.status(403).json({ success: false, message: "Cuenta bloqueada. Contacta al administrador." });
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, usuario.password);
    console.log("Contraseña coincide:", passwordMatch);

    if (passwordMatch) {
      // Reiniciar intentos fallidos y activar estatus
      await supabase
        .from("Usuario")
        .update({ intentos_fallidos: 0, estatus: true })
        .eq("id", usuario.id);

      // Generar token para todos los roles
      let token;

      if (usuario.id_rol === 1) {
        // Es un administrador
        console.log("ES ADMINISTRADOR");

        // Generar el token para administrador
        token = jwt.sign(
          {
            id: usuario.id,             // ID del usuario
            id_rol: usuario.id_rol,     // Rol del usuario (administrador)
            nombre_completo: usuario.nombre_usuario // Asegúrate de que esta propiedad esté correctamente asignada
          },
          process.env.JWT_SECRET, // Reemplaza con jwtSecret si no estás usando process.env
          { expiresIn: "1h" } // Expiración del token en 1 hora
        );
        return res.json({ success: true, token }); // Retorna el token
      } else {
        // Buscar el profesor relacionado con el usuario
        const { data: profesor, error: errorProfesor } = await supabase
          .from("Profesor")
          .select("*")
          .eq("id_usuario", usuario.id)  // Relación Usuario-Profesor
          .single();

        if (errorProfesor || !profesor) {
          console.error("Error al buscar profesor:", errorProfesor);
          return res.status(500).json({ success: false, message: "Error al buscar profesor." });
        }

        // Construir el id del profesor
        const profesorId = profesor.id;

        // Construir el nombre completo del profesor
        const nombreCompleto = `${profesor.nombre} ${profesor.apellido_paterno} ${profesor.apellido_materno}`.trim();

        // Generar el token con el nombre completo del profesor
        token = jwt.sign(
          {
            id: usuario.id,             // ID del usuario
            id_rol: usuario.id_rol,     // Rol del usuario
            id_profesor: profesorId,
            nombre_completo: nombreCompleto // Nombre completo del profesor
          },
          process.env.JWT_SECRET, // Reemplaza con jwtSecret si no estás usando process.env
          { expiresIn: "1h" } // Expiración del token en 1 hora
        );

        console.log("ID PROFESOR TABLA", profesor.id);
        return res.json({ success: true, token });
      }
    } else {
      // Contraseña incorrecta
      console.error("Contraseña incorrecta.");
      const nuevosIntentos = (usuario.intentos_fallidos || 0) + 1;
      console.log("Intentos fallidos:", nuevosIntentos);

      // Bloquear usuario después de 3 intentos fallidos y actualizar estatus
      if (nuevosIntentos >= 3) {
        await supabase
          .from("Usuario")
          .update({ intentos_fallidos: nuevosIntentos, estatus: false })  // Bloquea al usuario
          .eq("id", usuario.id);
        return res.status(403).json({ success: false, message: "Cuenta bloqueada. Contacta al administrador." });
      } else {
        await supabase
          .from("Usuario")
          .update({ intentos_fallidos: nuevosIntentos })
          .eq("id", usuario.id);
      }

      return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
    }
  } catch (err) {
    console.error("Error en el proceso de login:", err);
    return res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
});



app.get("/grados", async (req, res) => {
  try {
    const token = req.headers.authorization.split(" ")[1]; // Obtener el token del header
    const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
    const profesorId = decodedToken.id_profesor; // Obtener el ID del profesor
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
app.get("/obtener-ciclos-escolares", verificarToken, async (req, res) => {
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
  console.log("11111");
  const decodedToken = jwt.verify(token, jwtSecret); // Decodificar el token
  console.log("22222");
  const profesorId = decodedToken.id_profesor; // Obtener el ID del profesor
  console.log("33333");
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
    const profesorId = decodedToken.id_profesor; // Obtener el ID del profesor
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

// RUTA PARA OBTENER LAS OBSERVACIONES DISPONIBLES PARA UNA MATERIA
app.get("/obtener-observaciones-materia", verificarToken, async (req, res) => {
    const idMateria = req.query.id_materia; // Obtener el ID de la materia desde los parámetros de la consulta

    // Verificar que el ID de la materia esté presente
    if (!idMateria) {
        return res.status(400).json({
            success: false,
            message: "Falta el parámetro requerido: id_materia.",
        });
    }

    try {
        // Llamar a la función en Supabase para obtener las observaciones
        const { data: observaciones, error } = await supabase
            .from("Observacion") // Nombre de tu tabla
            .select("id, descripcion, descripcion_larga") // Seleccionar solo los campos necesarios
            .eq("id_materia", idMateria) // Filtrar por ID de materia
            .order("tipo", { ascending: false });

        if (error) {
            console.error("Error al obtener observaciones:", error);
            return res
                .status(500)
                .json({ success: false, message: "Error al obtener observaciones." });
        }

        return res.json(observaciones); // Devolver las observaciones
    } catch (err) {
        console.error("Error en la consulta:", err);
        return res
            .status(500)
            .json({ success: false, message: "Error en la consulta." });
    }
});





// Endpoint para obtener detalles de calificaciones
app.get("/calificaciones", verificarToken, async (req, res) => {
  const { id_ciclo_escolar, id_grado_nivel_escolar, id_profesor, id_materia } = req.query;

  // Valida que se hayan pasado todos los parámetros
  if (!id_ciclo_escolar || !id_grado_nivel_escolar || !id_profesor || !id_materia) {
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
      return res.status(500).json({ error: "Error al obtener las calificaciones." });
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
app.get("/periodos", verificarToken, async (req, res) => {
  const { id_ciclo_escolar } = req.query; // Obtener el parámetro id_ciclo_escolar de la query

  if (!id_ciclo_escolar) {
    return res.status(400).json({
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
      return res.status(500).json({
        success: false,
        message: "Error al obtener los periodos del ciclo escolar.",
      });
    }

    // Verificar si se encontraron periodos
    if (periodos.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No se encontraron periodos para el ciclo escolar especificado.",
      });
    }

    // Retornar los periodos en la respuesta
    res.json(periodos);
  } catch (err) {
    console.error("Error interno del servidor:", err);
    return res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
});


app.post('/actualizar-calificaciones', verificarToken, async (req, res) => {
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



// Ruta para guardar observaciones con validación de token
app.post('/guardar-observaciones', verificarToken, async (req, res) => {
    const { _id_calificacion, _observaciones, _id_usuario } = req.body; // Obtener id_usuario del cuerpo
    console.log(_observaciones);

    // Validaciones de entrada
    if (!_id_calificacion || !_observaciones || _observaciones.length === 0 || !_id_usuario) {
        return res.status(400).json({ mensaje: 'Datos incompletos' });
    }

    if (!Number.isInteger(_id_calificacion)) {
        return res.status(400).json({ mensaje: 'El ID de la calificación debe ser un número entero' });
    }

    if (!Array.isArray(_observaciones) || _observaciones.length > 2) {
        return res.status(400).json({ mensaje: 'Las observaciones deben ser un array con hasta 2 elementos' });
    }

    try {
        // Llamar a la función RPC de Supabase
        const { data: result, error } = await supabase.rpc('guardar_observaciones', {
            _id_calificacion,
            _observaciones,
            _id_usuario
        });

        if (error) {
            console.error('Error en la función RPC de Supabase:', error); // Log detallado
            return res.status(500).json({ mensaje: 'Error guardando observaciones', error: error.message });
        }

        res.status(200).json({ mensaje: 'Observaciones guardadas correctamente', data: result });
    } catch (err) {
        console.error('Error general en el servidor:', err.message); // Log detallado
        res.status(500).json({ mensaje: 'Error guardando observaciones', error: err.message });
    }
});

// Endpoint para obtener el reporte de detalle de calificaciones por ciclo escolar
app.get("/reporteDetalleCalificacionesPorCiclo/:idCiclo", verificarToken, async (req, res) => {
    const { idCiclo } = req.params;

    // Validar que el rol del usuario sea correcto
    if (req.user.id_rol !== 1) {
        return res.status(403).json({
            success: false,
            message: "No tienes permiso para acceder a este recurso.",
        });
    }

    try {
        // Llamar a la función de Supabase
        const { data, error } = await supabase.rpc('obtener_calificaciones_con_promedio', { _id_ciclo_escolar: parseInt(idCiclo) });

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
});



// Redirige a login.html cuando el usuario visita la raíz del sitio (/)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/login.html"));
});

// Iniciar el servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`); // Usa comillas invertidas para interpolar
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