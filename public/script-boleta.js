async function generarBoletas() {
    try {
        const response = await fetch("/generar-boleta", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`, // Asegúrate de incluir el token si es necesario
            },
        });

        if (!response.ok) {
            mostrarToast("Error al generar la boleta.", "error");
            throw new Error("Error al generar la boleta.");
        }

        // Crear un blob con el contenido del PDF
        const blob = await response.blob();
        
        // Crear un URL para el blob
        const url = window.URL.createObjectURL(blob);
        
        // Crear un enlace para descargar el PDF
        const a = document.createElement('a');
        a.href = url;
        a.download = 'boleta.pdf'; // Nombre del archivo
        document.body.appendChild(a);
        a.click();
        
        // Limpiar el DOM
        a.remove();
        window.URL.revokeObjectURL(url);
        
        mostrarToast("Boleta generada correctamente.", "success");
    } catch (error) {
        mostrarToast(`Error al generar la boleta: ${error.message}`, "error");
        throw error;
    }
}
