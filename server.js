require('dotenv').config(); // Cargar variables de entorno
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const path = require('path'); // Importar el módulo path
const jwt = require('jsonwebtoken'); // Asegúrate de instalar jsonwebtoken con npm

const app = express();

// Configurar Supabase
const supabaseUrl = process.env.SUPABASE_URL; // Cargar URL de Supabase desde la variable de entorno
const supabaseKey = process.env.SUPABASE_KEY; // Cargar clave de Supabase desde la variable de entorno
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Forzar el tipo MIME de CSS
app.use('/styles.css', (req, res, next) => {
    res.type('text/css');
    next();
});

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'tu_secreto', // Cambia esto por un secreto más seguro
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true } // Cambia a true si usas HTTPS
}));

// Ruta para el formulario de login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html')); // Servir el HTML de login
});

// Manejo del login
app.post('/login', async (req, res) => {
  console.log("Inicio del proceso de login"); // Mensaje inicial
    const { email, password } = req.body;

    // Buscar usuario en Supabase
    const { data: usuario, error } = await supabase
        .from('Usuario')
        .select('*')
        .eq('email', email)
        .single(); // Obtiene un único usuario

    if (error) {
        console.error("Error al buscar usuario:", error); // Log de error
        return res.json({ success: false, message: 'Error al buscar correo.' });
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
                .from('Profesor')
                .select('*')
                .eq('id_usuario', usuario.id) // Suponiendo que id_usuario en Profesor relaciona con id en Usuario
                .single();

            if (errorProfesor) {
                console.error("Error al buscar profesor:", errorProfesor);
                return res.json({ success: false, message: 'Error al buscar profesor.' });
            }

            if (profesor) {
                // Generar el nombre completo del profesor
                const nombreCompleto = `${profesor.nombre} ${profesor.apellido_paterno} ${profesor.apellido_materno}`;
                // Generar un token JWT con el nombre completo del profesor
                const token = jwt.sign(
                    { id: usuario.id, nombre_completo: nombreCompleto, profesor_id: profesor.id },
                    'tu_secreto_aqui',
                    { expiresIn: '1h' }
                );
                console.log("ID PROFESOR TABLA", profesor.id);
                // Responder con el token
                return res.json({ success: true, token }); // Envía el token al cliente
            } else {
                return res.json({ success: false, message: 'Profesor no encontrado.' });
            }
        }
       else{
                console.error("Contraseña incorrecta.");
                return res.json({ success: false, message: 'Contraseña incorrecta.' });
            }
    }
});

// Manejo del usuario
app.get('/get-usuario', async (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Asegúrate de obtener el token del encabezado

    if (!token) {
        return res.status(401).json({ message: 'No autorizado' }); // Si no hay token, responde con un error 401
    }

    try {
        const decoded = jwt.verify(token, 'tu_secreto_aqui'); // Verifica el token
        // Obtener el usuario a partir del token decodificado
        const { data: usuario, error: usuarioError } = await supabase
            .from('Usuario')
            .select('*')
            .eq('id', decoded.id) // Usa el ID del token para obtener el usuario
            .single();

        if (usuarioError) {
            console.error('Error al obtener el usuario:', usuarioError);
        } else {
            // Si se obtuvo el usuario, busca el profesor relacionado
            const { data: profesor, error: profesorError } = await supabase
                .from('Profesor')
                .select('id') // Selecciona el campo 'id' de la tabla Profesor
                .eq('id_usuario', usuario.id) // Usa 'id_usuario' para buscar el profesor relacionado
                .single();

            if (profesorError) {
                console.error('Error al obtener el profesor:', profesorError);
            } else {
                const profesorId = profesor.id; // Ahora tienes el ID del profesor
                console.log('ID del profesor:', profesorId);
                // Aquí puedes continuar con la lógica usando profesorId
            }
        }
      
        return res.json({ nombreUsuario: usuario.nombre_usuario }); // Responde con el nombre de usuario
    } catch (err) {
        console.error('Error al verificar el token:', err);
        return res.status(401).json({ message: 'Token inválido' });
    }
});

app.get('/grados', async (req, res) => {
    try {
        const token = req.headers.authorization.split(' ')[1]; // Obtener el token del header
        const decodedToken = jwt.verify(token, 'tu_secreto_aqui'); // Decodificar el token
        const profesorId = decodedToken.profesor_id; // Obtener el ID del profesor
        console.log(profesorId);
        // Obtener los grados y descripciones del nivel escolar para un profesor específico
        const { data: grados, error } = await supabase
          .rpc('obtener_grados_por_profesor', { _id_profesor: profesorId }); // Llamamos a la función con el ID del profesor

        if (error) {
            console.error("Error al ejecutar la función obtener_grados_por_profesor:", error);
            return res.status(500).json({ message: 'Error al obtener los grados y descripciones del nivel escolar.' });
        }

        // Enviar el resultado en la respuesta
        res.json(grados);
    } catch (error) {
        console.error(error);
        res.status(401).json({ message: 'No autorizado.' });
    }
});

app.get('/obtener-ciclos-escolares', async (req, res) => {
    try {
        const { data, error } = await supabase.rpc('obtener_ciclos_escolares');

        if (error) {
            console.error('Error al obtener ciclos escolares:', error);
            return res.status(500).json({ message: 'Error al obtener ciclos escolares' });
        }

        return res.json(data);
    } catch (err) {
        console.error('Error interno del servidor:', err);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});





