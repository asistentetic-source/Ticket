/**
 * ============================================================================
 * MESA DE AYUDA - MANTENIMIENTO & TIC
 * DIALIMENTOS S.A.S.
 * ============================================================================
 * Archivo: Código.js - v1.0.1
 * Modificado: 2026-10-13
 * Conectado directamente a:
 * https://docs.google.com/spreadsheets/d/11jF6iWdJELrakflr0gl155Wm4ZIV-VaGWPbueSE_n4M/edit
 * ============================================================================
 */

// ============================================================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ============================================================================
const CONFIG = {
  // ID del Spreadsheet de Google Sheets proporcionado
  SPREADSHEET_ID: "11jF6iWdJELrakflr0gl155Wm4ZIV-VaGWPbueSE_n4M",

  // Zona horaria oficial de Colombia (UTC-5 sin horario de verano)
  TIMEZONE: "America/Bogota",

  // Nombres exactos de las 7 hojas en el Spreadsheet
  SHEETS: {
    EMPLEADOS: "EMPLEADOS",
    PUNTOS: "PUNTOS",
    TIPO_SERVICIO: "TIPO SERVICIO",
    TIPO_FALLA: "TIPO FALLA",
    ESTADO: "ESTADO",
    NIVEL_SERVICIO: "NIVEL DE SERVICIO",
    TICKETS: "TICKET"
  },
  
  // Carpeta de Google Drive para adjuntos y fotos
  DRIVE_FOLDER_ID: "1h6-vMUtci8YKuWISrpm9Fm7nUXkn0C1X",
  DRIVE_FOLDER_NAME: "MesaDeAyuda_Dialimentos_Adjuntos",
  
  // Correos de los coordinadores
  COORDINADOR_MTO_EMAIL: "pardo@dialimentos.com.co",
  COORDINADOR_TIC_EMAIL: "soporte.tic@dialimentos.com.co",

  // Contraseñas de acceso administrativo por área
  ADMIN_PASSWORDS: {
    MANTENIMIENTO: "mto2026", // Contraseña para Coordinación de Mantenimiento
    TIC: "tic2026",            // Contraseña para Coordinación de TIC / Sistemas
    RRHH: "rrhh2026"           // Contraseña para Recursos Humanos / Reclutador
  },

  // Perfil especial: Administradora (acceso total a tickets de Mantenimiento)
  ADMINISTRADORA: {
    USUARIO: "1234",
    PASSWORD: "123",
    NOMBRES: "ADMINISTRADORA",
    TIPO_USUARIO: "Administradora",
    AREA: "MANTENIMIENTO"
  },

  APP_TITLE: "Mesa de Ayuda - Dialimentos"
};

// ============================================================================
// 2. ENRUTADOR PRINCIPAL (doGet y doPost para API REST / Base de Datos)
// ============================================================================
/**
 * Renderiza la aplicación Web App en Google Apps Script o responde solicitudes GET a la API
 */
function doGet(e) {
  // Si la petición viene con parámetro action, responder como API JSON
  if (e && e.parameter && e.parameter.action) {
    return responderApi(e.parameter.action, e.parameter);
  }

  var template = HtmlService.createTemplateFromFile("index");
  
  return template.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Recibe peticiones POST desde GitHub y ejecuta las acciones contra Google Sheets
 */
function doPost(e) {
  try {
    var rawData = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var body = {};
    try {
      body = JSON.parse(rawData);
    } catch (parseErr) {
      body = (e && e.parameter) ? e.parameter : {};
    }

    var action = body.action || (e && e.parameter ? e.parameter.action : "");
    return responderApi(action, body);
  } catch (err) {
    return crearRespuestaJson({ success: false, message: "Error interno del servidor: " + err.message });
  }
}

/**
 * Disparador nativo de Google Sheets (Simple Trigger).
 * Se ejecuta automáticamente en tiempo real cada vez que un usuario edita
 * manualmente una celda dentro de la hoja de Google Sheets.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = sheet.getName();

    // Solo actuar si están editando la hoja EMPLEADOS
    if (sheetName !== CONFIG.SHEETS.EMPLEADOS) return;

    var row = range.getRow();
    if (row <= 1) return; // Omitir fila de encabezados

    var col = range.getColumn();

    // Si editaron cualquier columna entre A y F (1 a 6)
    if (col >= 1 && col <= 6) {
      var celdaPermisos = sheet.getRange(row, 7);
      var permActual = String(celdaPermisos.getValue() || "").trim();

      // Si la columna G está vacía, o si acaban de modificar el TIPO USUARIO (columna 5)
      if (!permActual || col === 5) {
        var tipoUsuario = String(sheet.getRange(row, 5).getValue() || "Empleado").trim();
        var area = String(sheet.getRange(row, 6).getValue() || "").trim();
        var permCalculado = obtenerPermisosPorDefectoRol(tipoUsuario, area);
        celdaPermisos.setValue(permCalculado);
      }
    }
  } catch (err) {
    Logger.log("Error en onEdit: " + err.message);
  }
}

/**
 * Enrutador de acciones para la API de Google Apps Script (Base de Datos)
 */
function responderApi(action, data) {
  var resultado = { success: false, message: "Acción no reconocida: " + action };

  try {
    switch (action) {
      case "obtenerCatalogos":
        resultado = obtenerCatalogos();
        break;

      case "login":
        resultado = login(data.cedula);
        break;

      case "loginAdmin":
        resultado = loginAdmin(data.cedula, data.password, data.area);
        break;

      case "obtenerTickets":
        resultado = obtenerTickets(data.filtros || data);
        break;

      case "crearTicket":
        resultado = crearTicket(data.ticketData || data);
        break;

      case "asignarTicket":
        resultado = asignarTicket(data.asignacionData || data);
        break;

      case "cerrarTicket":
        resultado = cerrarTicket(data.cierreData || data);
        break;

      case "obtenerActaPdf":
        resultado = obtenerActaPdf(data.nroTicket);
        break;

      case "modificarPlaca":
        resultado = modificarPlaca(data.nroTicket, data.nuevaPlaca);
        break;

      case "actualizarCamposAdministradora":
        resultado = actualizarCamposAdministradora(data);
        break;

      case "agregarEmpleadoIndividual":
        resultado = agregarEmpleadoIndividual(data);
        break;

      case "agregarEmpleadosMasivo":
        resultado = agregarEmpleadosMasivo(data.empleados || data);
        break;

      case "agregarPuntoServicio":
        resultado = agregarPuntoServicio(data.nombre, data.codigo);
        break;

      case "obtenerImagenDrive":
        resultado = obtenerImagenDriveBase64(data.urlOId || data.url);
        break;

      case "sincronizarPermisosEmpleados":
        resultado = sincronizarPermisosEmpleados();
        break;

      default:
        resultado = { success: false, message: "Acción no soportada: " + action };
        break;
    }
  } catch (e) {
    resultado = { success: false, message: e.message };
  }

  return crearRespuestaJson(resultado);
}

function crearRespuestaJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función auxiliar para incluir archivos HTML parciales en plantillas de Apps Script.
 * Permite usar: <?!= include('css'); ?> y <?!= include('js'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// 3. CAPA DE ACCESO A DATOS (Google Sheets)
// ============================================================================
/**
 * Obtiene el Spreadsheet conectado por ID o por activo
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (e) {
      Logger.log("Aviso: No se pudo abrir por ID, intentando activo: " + e.message);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Obtiene una hoja por su nombre garantizando que exista.
 */
function getSheetByName(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error("No se encontró la hoja: " + name);
  }
  return sheet;
}

/**
 * Convierte los datos de una hoja en un arreglo de objetos JSON utilizando la fila 1 como encabezados.
 */
function sheetToJson(sheetName) {
  var sheet = getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0].map(function(h) { 
    return String(h).trim(); 
  });
  
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var hasData = row.some(function(cell) { 
      return cell !== "" && cell !== null && cell !== undefined; 
    });
    if (!hasData) continue;

    var obj = { _rowIndex: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (header) {
        obj[header] = row[j];
      }
    }
    rows.push(obj);
  }
  return rows;
}

// ============================================================================
// 4. API DE CATÁLOGOS Y AUTENTICACIÓN
// ============================================================================
/**
 * Retorna los permisos automáticos predeterminados según el rol y área de un empleado
 */
function obtenerPermisosPorDefectoRol(tipoUsuario, area) {
  var tipo = String(tipoUsuario || "").toLowerCase();
  var a = String(area || "").toUpperCase();

  if (tipo.indexOf("administradora") !== -1) {
    return "GESTIONAR_COSTOS, VER_TODOS, BUSCAR, EDITAR_PLACA, CREAR";
  }
  if (tipo.indexOf("administrador") !== -1 || tipo.indexOf("coordinador") !== -1) {
    if (a.indexOf("RRHH") !== -1 || a.indexOf("RECURSO") !== -1) {
      return "RRHH, VER_TODOS, BUSCAR, CREAR";
    }
    return "ASIGNAR, CERRAR, BUSCAR, EDITAR_PLACA, VER_TODOS, PUNTOS, CREAR";
  }
  if (tipo.indexOf("tecnico") !== -1 || tipo.indexOf("técnico") !== -1) {
    return "CERRAR, BUSCAR, EDITAR_PLACA, VER_TODOS, CREAR";
  }
  if (tipo.indexOf("reclutador") !== -1) {
    return "RRHH, CREAR";
  }
  // Usuario normal (Empleado)
  return "CREAR";
}

/**
 * Obtiene todos los catálogos maestros para inicializar la interfaz.
 */
function obtenerCatalogos() {
  try {
    var empleados = sheetToJson(CONFIG.SHEETS.EMPLEADOS);
    var sheetEmp = null;
    try { sheetEmp = getSheetByName(CONFIG.SHEETS.EMPLEADOS); } catch(e) {}

    // Auto-escribir permisos en la columna G de EMPLEADOS si alguna fila está vacía
    empleados.forEach(function(emp) {
      var permActual = String(emp["PERMISOS"] || emp["permisos"] || "").trim();
      if (!permActual) {
        var rolEmp = emp["TIPO USUARIO"] || "Empleado";
        var areaEmp = emp["AREA"] || "";
        var permCalc = obtenerPermisosPorDefectoRol(rolEmp, areaEmp);
        emp["PERMISOS"] = permCalc;
        if (sheetEmp && emp._rowIndex) {
          try { sheetEmp.getRange(emp._rowIndex, 7).setValue(permCalc); } catch(err) {}
        }
      }
    });

    var puntos = sheetToJson(CONFIG.SHEETS.PUNTOS);
    var tiposServicio = sheetToJson(CONFIG.SHEETS.TIPO_SERVICIO);
    var tiposFalla = sheetToJson(CONFIG.SHEETS.TIPO_FALLA);
    var estados = sheetToJson(CONFIG.SHEETS.ESTADO);
    var nivelesServicio = sheetToJson(CONFIG.SHEETS.NIVEL_SERVICIO);

    // Mapear técnicos con su área respectiva (columna AREA)
    var tecnicos = empleados.filter(function(e) {
      var tipo = String(e["TIPO USUARIO"] || "").toLowerCase();
      return tipo.indexOf("tecnico") !== -1 || tipo.indexOf("técnico") !== -1 || tipo.indexOf("administrador") !== -1;
    }).map(function(t) {
      return {
        cedula: String(t["CEDULA"] || "").trim(),
        nombres: t["NOMBRES APELLIDOS"] || "",
        email: t["EMAIL"] || "",
        celular: t["CELULAR"] || "",
        tipoUsuario: t["TIPO USUARIO"] || "Tecnico",
        area: String(t["AREA"] || "").toUpperCase().trim(),
        permisos: String(t["PERMISOS"] || t["permisos"] || "").trim()
      };
    });

    // Normalizar puntos de servicio
    var puntosMapeados = puntos.map(function(p) {
      var nombre = p["NOMBRE"] || p["PUNTO DE SERVICIO"] || p["PUNTO"] || p["DESCRIPCION"] || p.nombre || "";
      var codigo = p["CODIGO"] || p["CÓDIGO"] || p["COD"] || p.codigo || "";
      if (!nombre) {
        var keys = Object.keys(p).filter(function(k) { return k !== "_rowIndex"; });
        nombre = keys[0] ? String(p[keys[0]]) : "";
        if (!codigo && keys[1]) codigo = String(p[keys[1]]);
      }
      return {
        nombre: String(nombre || "").trim(),
        codigo: String(codigo || "").trim()
      };
    }).filter(function(p) { return p.nombre !== ""; });

    // Normalizar tipos de falla (lee código, descripción y área para filtrar según TIC o Mantenimiento)
    var tiposFallaMapeados = tiposFalla.map(function(f) {
      // 1. Extraer Área si viene en una columna
      var area = "";
      for (var k in f) {
        if (k.toLowerCase().indexOf("area") !== -1 || k.toLowerCase().indexOf("área") !== -1) {
          area = String(f[k] || "").trim().toUpperCase();
          break;
        }
      }

      // 2. Extraer Código numérico
      var codigo = "";
      for (var k in f) {
        var kl = k.toLowerCase();
        if (kl.indexOf("codigo") !== -1 || kl.indexOf("código") !== -1 || kl.indexOf("id") !== -1) {
          codigo = String(f[k] || "").trim();
          break;
        }
      }

      // 3. Extraer Nombre/Descripción textual de la falla (NO un número 1,2,3)
      var nombre = "";
      // Prioridad a columnas descriptivas
      for (var k in f) {
        if (k === "_rowIndex") continue;
        var kl = k.toLowerCase();
        if (kl.indexOf("area") !== -1 || kl.indexOf("área") !== -1) continue;
        if (kl.indexOf("descrip") !== -1 || kl.indexOf("falla") !== -1 || kl.indexOf("nombre") !== -1) {
          var val = String(f[k] || "").trim();
          if (val && isNaN(Number(val))) {
            nombre = val;
            break;
          }
        }
      }

      // Si no se encontró por nombre de encabezado, buscar cualquier valor de celda que sea texto explicativo (no numérico y no el área)
      if (!nombre) {
        for (var k in f) {
          if (k === "_rowIndex") continue;
          var kl = k.toLowerCase();
          if (kl.indexOf("area") !== -1 || kl.indexOf("área") !== -1) continue;
          var val = String(f[k] || "").trim();
          if (val && isNaN(Number(val)) && val.toUpperCase() !== area.toUpperCase() && val.length > 1) {
            nombre = val;
            break;
          }
        }
      }

      // Si aún no se halló, usar la segunda columna disponible si existe
      if (!nombre) {
        var allKeys = Object.keys(f).filter(function(k) { 
          return k !== "_rowIndex" && k.toLowerCase().indexOf("area") === -1; 
        });
        if (allKeys.length > 1) {
          nombre = String(f[allKeys[1]] || "").trim();
        } else if (allKeys.length > 0) {
          nombre = String(f[allKeys[0]] || "").trim();
        }
      }

      // 4. Determinar Área (MANTENIMIENTO vs TIC) si no viene explícita en la hoja
      if (!area) {
        var numCod = parseInt(codigo, 10);
        if (!isNaN(numCod)) {
          // Códigos 1 al 16 son de Mantenimiento; 17 al 34 en adelante son de TIC
          if (numCod >= 1 && numCod <= 16) {
            area = "MANTENIMIENTO";
          } else if (numCod >= 17) {
            area = "TIC";
          }
        }
      }

      // Respaldo por palabras clave si no se pudo por código
      if (!area && nombre) {
        var nomMayus = nombre.toUpperCase();
        var keywordsTIC = [
          "HARDWARE", "SOFTWARE", "RED", "CONECTIVIDAD", "INTERNET", "TELEFON", "IMPRESORA",
          "SISTEMA", "APLICACION", "CORREO", "CUENTA", "ACCESO", "CONTRASE", "SERVIDOR",
          "ALMACENAMIENTO", "SEGURIDAD", "POS", "PERIFERIC", "CABLEADO", "COMUNICACION"
        ];
        var esTIC = keywordsTIC.some(function(kw) { return nomMayus.indexOf(kw) !== -1; });
        area = esTIC ? "TIC" : "MANTENIMIENTO";
      }

      return {
        nombre: nombre,
        codigo: codigo || (f["CODIGOCATEGORIA"] ? String(f["CODIGOCATEGORIA"]) : ""),
        area: area
      };
    }).filter(function(f) { return f.nombre !== "" && f.nombre !== "undefined"; });

    // Normalizar tipos de servicio
    var tiposServicioMapeados = tiposServicio.map(function(s) {
      var nombre = s["DESCRIPCION CATEGORIA"] || s["DESCRIPCION"] || s["DESCRIPCIÓN CATEGORIA"] || s["DESCRIPCIÓN"] || s.nombre || s.descripcion || "";
      var codigo = s["CODIGOCATEGORIA"] || s["CODIGO"] || s.codigo || "";
      var area = s["AREA"] || s.area || "";
      var notas = s["NOTAS / EXPLICACIÓN"] || s["NOTAS / EXPLICACION"] || s["NOTAS"] || "";
      if (!nombre) {
        var keys = Object.keys(s).filter(function(k) { 
          var kl = k.toLowerCase();
          return k !== "_rowIndex" && kl !== "codigocategoria" && kl !== "codigo" && kl !== "id" && kl !== "area"; 
        });
        if (keys.length > 0) nombre = String(s[keys[0]] || "");
      }
      return {
        nombre: String(nombre || "").trim(),
        codigo: String(codigo || "").trim(),
        area: String(area || "").trim(),
        notas: String(notas || "").trim()
      };
    }).filter(function(s) { return s.nombre !== "" && s.nombre !== "undefined"; });

    return {
      success: true,
      data: {
        empleados: empleados,
        tecnicos: tecnicos,
        puntos: puntosMapeados.length > 0 ? puntosMapeados : puntos,
        tiposServicio: tiposServicioMapeados.length > 0 ? tiposServicioMapeados : tiposServicio,
        tiposFalla: tiposFallaMapeados.length > 0 ? tiposFallaMapeados : tiposFalla,
        estados: estados,
        nivelesServicio: nivelesServicio,
        tiposTicket: ["Incidente", "Requerimiento", "Servicio"],
        tiposRepuesto: ["Nuevo", "Usado", "De segunda", "Reparado", "No aplica"]
      }
    };
  } catch (error) {
    Logger.log("Error en obtenerCatalogos: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Autentica un usuario general (Empleado o Técnico) por su cédula.
 * Si la cédula pertenece a un Administrador, Coordinador o Reclutador,
 * retorna la información del usuario indicando que requiere su contraseña de acceso.
 */
function login(cedula) {
  try {
    var cedulaLimpia = String(cedula || "").trim();
    if (!cedulaLimpia) {
      return { success: false, message: "Debe ingresar una cédula." };
    }

    // Detección especial de perfil Administradora
    if (cedulaLimpia === CONFIG.ADMINISTRADORA.USUARIO) {
      return {
        success: false,
        esAdmin: true,
        requierePassword: true,
        user: {
          cedula: CONFIG.ADMINISTRADORA.USUARIO,
          nombres: CONFIG.ADMINISTRADORA.NOMBRES,
          tipoUsuario: CONFIG.ADMINISTRADORA.TIPO_USUARIO,
          area: CONFIG.ADMINISTRADORA.AREA,
          permisos: "GESTIONAR_COSTOS,VER_TODOS,FILTRAR,BUSCAR,EDITAR_PLACA"
        },
        message: "Perfil de Administradora detectado."
      };
    }

    var empleados = sheetToJson(CONFIG.SHEETS.EMPLEADOS);
    var usuarioEncontrado = null;

    for (var i = 0; i < empleados.length; i++) {
      var emp = empleados[i];
      var cedulaEmp = String(emp["CEDULA"] || "").replace(/[^0-9]/g, "");
      var cedulaBuscada = cedulaLimpia.replace(/[^0-9]/g, "");

      if (cedulaEmp === cedulaBuscada && cedulaBuscada !== "") {
        var rol = String(emp["TIPO USUARIO"] || "Empleado").trim();
        var rolLower = rol.toLowerCase();
        var areaEmp = String(emp["AREA"] || "").toUpperCase().trim();
        var permisosEmp = String(emp["PERMISOS"] || emp["permisos"] || "").trim();

        // Normalizar área registrada en la hoja de cálculo
        var areaNormalizada = "MANTENIMIENTO";
        if (areaEmp.indexOf("TIC") !== -1 || areaEmp.indexOf("SISTEMA") !== -1) {
          areaNormalizada = "TIC";
        } else if (areaEmp.indexOf("RECURSO") !== -1 || areaEmp.indexOf("RRHH") !== -1) {
          areaNormalizada = "RRHH";
        } else {
          areaNormalizada = "MANTENIMIENTO";
        }

        // Si es Administrador, Coordinador o Reclutador, solicita contraseña
        if (rolLower.indexOf("administrador") !== -1 || rolLower.indexOf("reclutador") !== -1 || rolLower.indexOf("coordinador") !== -1) {
          return {
            success: false,
            esAdmin: true,
            requierePassword: true,
            user: {
              cedula: String(emp["CEDULA"]),
              nombres: emp["NOMBRES APELLIDOS"],
              tipoUsuario: rol,
              area: areaNormalizada,
              permisos: permisosEmp
            },
            message: "Perfil administrativo detectado."
          };
        }

        usuarioEncontrado = {
          cedula: emp["CEDULA"],
          nombres: emp["NOMBRES APELLIDOS"],
          email: emp["EMAIL"],
          celular: emp["CELULAR"],
          tipoUsuario: rol,
          area: areaEmp,
          permisos: permisosEmp
        };
        break;
      }
    }

    if (usuarioEncontrado) {
      return { success: true, user: usuarioEncontrado };
    } else {
      return { success: false, message: "Cédula no encontrada en el registro de empleados de Dialimentos." };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Autentica exclusivamente a Administradores / Coordinadores mediante Cédula y Contraseña.
 * Determina el área y rol automáticamente a partir del registro del empleado en Google Sheets.
 */
function loginAdmin(cedula, password, area) {
  try {
    var cedulaLimpia = String(cedula || "").trim();
    var passLimpio = String(password || "").trim();
    var areaLimpia = String(area || "").trim().toUpperCase();

    if (!cedulaLimpia || !passLimpio) {
      return { success: false, message: "Debe ingresar usuario y contraseña." };
    }

    // ── Perfil especial: Administradora ──────────────────────────────────────
    if (cedulaLimpia === CONFIG.ADMINISTRADORA.USUARIO) {
      if (passLimpio === CONFIG.ADMINISTRADORA.PASSWORD) {
        return {
          success: true,
          user: {
            cedula: CONFIG.ADMINISTRADORA.USUARIO,
            nombres: CONFIG.ADMINISTRADORA.NOMBRES,
            email: "",
            celular: "",
            tipoUsuario: CONFIG.ADMINISTRADORA.TIPO_USUARIO,
            area: CONFIG.ADMINISTRADORA.AREA,
            permisos: "GESTIONAR_COSTOS,VER_TODOS,FILTRAR,BUSCAR,EDITAR_PLACA"
          }
        };
      } else {
        return { success: false, message: "Contraseña incorrecta para Administradora." };
      }
    }

    // ── Flujo estándar para Administradores, Coordinadores y Reclutadores ────
    var empleados = sheetToJson(CONFIG.SHEETS.EMPLEADOS);
    var usuarioEncontrado = null;

    for (var i = 0; i < empleados.length; i++) {
      var emp = empleados[i];
      var cedulaEmp = String(emp["CEDULA"] || "").replace(/[^0-9]/g, "");
      var cedulaBuscada = cedulaLimpia.replace(/[^0-9]/g, "");

      if (cedulaEmp === cedulaBuscada && cedulaBuscada !== "") {
        var rol = String(emp["TIPO USUARIO"] || "").trim();
        var areaEmp = String(emp["AREA"] || "").toUpperCase().trim();
        var permisosEmp = String(emp["PERMISOS"] || emp["permisos"] || "").trim();

        // Determinar área normalizada automáticamente si no viene provista
        var areaNormalizada = areaLimpia;
        if (!areaNormalizada) {
          if (areaEmp.indexOf("TIC") !== -1 || areaEmp.indexOf("SISTEMA") !== -1) {
            areaNormalizada = "TIC";
          } else if (areaEmp.indexOf("RECURSO") !== -1 || areaEmp.indexOf("RRHH") !== -1) {
            areaNormalizada = "RRHH";
          } else {
            areaNormalizada = "MANTENIMIENTO";
          }
        }

        // Validar contraseña configurada para el área
        var passEsperada = CONFIG.ADMIN_PASSWORDS[areaNormalizada];
        if (!passEsperada || passLimpio !== passEsperada) {
          return { success: false, message: "Contraseña incorrecta." };
        }

        usuarioEncontrado = {
          cedula: emp["CEDULA"],
          nombres: emp["NOMBRES APELLIDOS"],
          email: emp["EMAIL"],
          celular: emp["CELULAR"],
          tipoUsuario: areaNormalizada === "RRHH" ? "Reclutador" : (rol || "Administrador"),
          area: areaNormalizada,
          permisos: permisosEmp
        };
        break;
      }
    }

    if (usuarioEncontrado) {
      return { success: true, user: usuarioEncontrado };
    } else {
      return { success: false, message: "Cédula no encontrada en el registro de empleados." };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Actualiza los campos exclusivos de la Administradora en un ticket:
 * costo, aprobación, observación administrativa, consulta y proveedor.
 */
function actualizarCamposAdministradora(datos) {
  try {
    if (!datos || !datos.nroTicket) {
      return { success: false, message: "Número de ticket requerido." };
    }
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var fila = buscarFilaPorTicket(sheet, datos.nroTicket);
    if (!fila) {
      return { success: false, message: "Ticket no encontrado: " + datos.nroTicket };
    }

    var campos = [
      { nombre: "Costo",          valor: datos.costo          || "" },
      { nombre: "Aprobacion",     valor: datos.aprobacion     || "" },
      { nombre: "Obs Admin",      valor: datos.obsAdmin       || "" },
      { nombre: "Consulta Admin", valor: datos.consultaAdmin  || "" },
      { nombre: "Proveedor",      valor: datos.proveedor      || "" }
    ];

    for (var i = 0; i < campos.length; i++) {
      var col = obtenerOcrearColumna(sheet, campos[i].nombre);
      sheet.getRange(fila, col).setValue(campos[i].valor);
    }

    return { success: true, message: "Campos actualizados correctamente para el ticket " + datos.nroTicket };
  } catch (error) {
    Logger.log("Error en actualizarCamposAdministradora: " + error.message);
    return { success: false, message: error.message };
  }
}

// ============================================================================
// 4.1 GESTIÓN DE EMPLEADOS Y PUNTOS (RECURSOS HUMANOS / RECLUTADOR)
// ============================================================================
/**
 * Agrega un empleado individual a la hoja EMPLEADOS.
 */
function agregarEmpleadoIndividual(datos) {
  try {
    var cedula = String(datos.cedula || "").trim();
    var nombres = String(datos.nombres || "").trim();
    var email = String(datos.email || "").trim();
    var celular = String(datos.celular || "").trim();
    var tipoUsuario = String(datos.tipoUsuario || "Empleado").trim();
    var area = String(datos.area || "OPERACIONES").trim().toUpperCase();
    var permisos = String(datos.permisos || "").trim();
    if (!permisos) {
      permisos = obtenerPermisosPorDefectoRol(tipoUsuario, area);
    }

    if (!cedula || !nombres) {
      return { success: false, message: "La cédula y los nombres completos son obligatorios." };
    }

    var sheet = getSheetByName(CONFIG.SHEETS.EMPLEADOS);
    var data = sheet.getDataRange().getValues();

    // Validar si la cédula ya existe
    for (var i = 1; i < data.length; i++) {
      var cedulaExistente = String(data[i][0] || "").replace(/[^0-9]/g, "");
      var cedulaNueva = cedula.replace(/[^0-9]/g, "");
      if (cedulaExistente === cedulaNueva && cedulaNueva !== "") {
        return { success: false, message: "La cédula " + cedula + " ya se encuentra registrada (" + data[i][1] + ")." };
      }
    }

    // Insertar fila: CEDULA, NOMBRES APELLIDOS, EMAIL, CELULAR, TIPO USUARIO, AREA, PERMISOS
    sheet.appendRow([cedula, nombres, email, celular, tipoUsuario, area, permisos]);

    return {
      success: true,
      message: "Empleado " + nombres + " (C.C. " + cedula + ") registrado exitosamente. Ya puede iniciar sesión."
    };
  } catch (error) {
    Logger.log("Error en agregarEmpleadoIndividual: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Carga masiva de empleados desde un arreglo de objetos (Excel/CSV parseado).
 */
function agregarEmpleadosMasivo(listaEmpleados) {
  try {
    if (!listaEmpleados || !listaEmpleados.length) {
      return { success: false, message: "No se recibieron datos de empleados para importar." };
    }

    var sheet = getSheetByName(CONFIG.SHEETS.EMPLEADOS);
    var data = sheet.getDataRange().getValues();

    // Mapa de cédulas existentes para validación instantánea
    var cedulasExistentes = {};
    for (var i = 1; i < data.length; i++) {
      var c = String(data[i][0] || "").replace(/[^0-9]/g, "");
      if (c) cedulasExistentes[c] = true;
    }

    var filasParaInsertar = [];
    var omitidos = 0;

    for (var j = 0; j < listaEmpleados.length; j++) {
      var emp = listaEmpleados[j];
      var cedula = String(emp.cedula || emp.CEDULA || "").trim();
      var nombres = String(emp.nombres || emp["NOMBRES APELLIDOS"] || emp.nombre || "").trim();
      var email = String(emp.email || emp.EMAIL || emp.correo || "").trim();
      var celular = String(emp.celular || emp.CELULAR || emp.telefono || "").trim();
      var tipoUsuario = String(emp.tipoUsuario || emp["TIPO USUARIO"] || emp.rol || "Empleado").trim();
      var area = String(emp.area || emp.AREA || "OPERACIONES").trim().toUpperCase();
      var permisos = String(emp.permisos || emp.PERMISOS || emp[6] || "").trim();
      if (!permisos) {
        permisos = obtenerPermisosPorDefectoRol(tipoUsuario, area);
      }

      var cedulaNumerica = cedula.replace(/[^0-9]/g, "");
      if (!cedulaNumerica || !nombres) {
        omitidos++;
        continue;
      }

      // Si ya existe la cédula, se omite
      if (cedulasExistentes[cedulaNumerica]) {
        omitidos++;
        continue;
      }

      cedulasExistentes[cedulaNumerica] = true;
      filasParaInsertar.push([cedula, nombres, email, celular, tipoUsuario, area, permisos]);
    }

    if (filasParaInsertar.length === 0) {
      return {
        success: false,
        message: "No se insertó ningún empleado. Es posible que todas las cédulas ya existan en la base de datos o falten datos obligatorios."
      };
    }

    // Inserción en bloque para alta velocidad (7 columnas con columna G de Permisos)
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, filasParaInsertar.length, 7).setValues(filasParaInsertar);

    return {
      success: true,
      totalProcesados: listaEmpleados.length,
      insertados: filasParaInsertar.length,
      omitidos: omitidos,
      message: "Se importaron exitosamente " + filasParaInsertar.length + " empleados." + (omitidos > 0 ? " (" + omitidos + " omitidos por cédula duplicada o campos vacíos)." : "")
    };
  } catch (error) {
    Logger.log("Error en agregarEmpleadosMasivo: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Recorre la hoja EMPLEADOS y rellena la columna G con los permisos predeterminados si está vacía.
 */
function sincronizarPermisosEmpleados() {
  try {
    var sheet = getSheetByName(CONFIG.SHEETS.EMPLEADOS);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, actualizados: 0 };

    var actualizados = 0;
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var perm = String(row[6] || "").trim(); // Columna G: PERMISOS
      if (!perm) {
        var rol = String(row[4] || "Empleado");
        var area = String(row[5] || "");
        var permAsignar = obtenerPermisosPorDefectoRol(rol, area);
        sheet.getRange(i + 1, 7).setValue(permAsignar);
        actualizados++;
      }
    }
    return { success: true, actualizados: actualizados };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Agrega un nuevo punto de servicio a la hoja PUNTOS.
 */
function agregarPuntoServicio(puntoData) {
  try {
    var codigo = String(puntoData.codigo || "").trim().toUpperCase();
    var nombre = String(puntoData.nombre || "").trim();

    if (!nombre) {
      return { success: false, message: "El nombre del punto de servicio es obligatorio." };
    }
    if (!codigo) {
      codigo = nombre.substring(0, 6).toUpperCase();
    }

    var sheet = getSheetByName(CONFIG.SHEETS.PUNTOS);
    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];

    var colCodigo = -1;
    var colNombre = -1;
    for (var i = 0; i < headers.length; i++) {
      var h = String(headers[i]).toLowerCase().trim();
      if (h.indexOf("codigo") !== -1 || h.indexOf("código") !== -1 || h === "cod") {
        colCodigo = i + 1;
      }
      if (h.indexOf("nombre") !== -1 || h.indexOf("punto") !== -1 || h.indexOf("descripcion") !== -1) {
        colNombre = i + 1;
      }
    }

    // Validar duplicado
    for (var j = 1; j < data.length; j++) {
      var nomExistente = String(colNombre > 0 ? data[j][colNombre - 1] : data[j][0] || "").toLowerCase().trim();
      if (nomExistente === nombre.toLowerCase()) {
        return { success: false, message: "El punto de servicio '" + nombre + "' ya existe en el sistema." };
      }
    }

    var numCols = Math.max(sheet.getLastColumn(), 2);
    var nuevaFila = new Array(numCols);
    for (var k = 0; k < numCols; k++) nuevaFila[k] = "";

    if (colCodigo > 0 && colNombre > 0) {
      nuevaFila[colCodigo - 1] = codigo;
      nuevaFila[colNombre - 1] = nombre;
    } else {
      nuevaFila[0] = codigo;
      nuevaFila[1] = nombre;
    }

    sheet.appendRow(nuevaFila);

    return {
      success: true,
      punto: { codigo: codigo, nombre: nombre },
      message: "Punto de servicio '" + nombre + "' (" + codigo + ") registrado correctamente."
    };
  } catch (error) {
    Logger.log("Error en agregarPuntoServicio: " + error.message);
    return { success: false, message: error.message };
  }
}

// ============================================================================
// 5. GESTIÓN DE TICKETS (CRUD Y FLUJO DE TRABAJO)
// ============================================================================
/**
 * Obtiene la lista de tickets aplicando filtros según el rol del usuario.
 */
function obtenerTickets(filtros) {
  try {
    filtros = filtros || {};
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, tickets: [] };

    var headers = data[0].map(function(h) { return String(h || "").trim(); });
    var headersLower = headers.map(function(h) { return h.toLowerCase(); });
    var tickets = [];

    // Blindaje de seguridad: si el usuario es Administrador o Técnico de un área específica, forzar filtro a su área
    // Excepción: Administradora ve TODOS los tickets de Mantenimiento sin restricción adicional
    if (filtros.userRole) {
      var rLower = String(filtros.userRole).toLowerCase();
      var esAdministradora = rLower === "administradora";
      var esRolArea = (rLower.indexOf("administrador") !== -1 || rLower.indexOf("tecnico") !== -1 || rLower.indexOf("técnico") !== -1) && !esAdministradora;
      if (esAdministradora) {
        // La Administradora ve todos los tickets de Mantenimiento (sin filtro de cédula)
        filtros.area = "Mantenimiento";
        filtros.cedulaSolicitante = undefined;
        filtros.cedulaResponsable = undefined;
      } else if (esRolArea && filtros.userArea) {
        var uArea = String(filtros.userArea).toUpperCase().trim();
        if (uArea.indexOf("TIC") !== -1) filtros.area = "TIC";
        else if (uArea.indexOf("MANTEN") !== -1 || uArea.indexOf("MTO") !== -1) filtros.area = "Mantenimiento";
      }
    }

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row || !row[0]) continue;

      var rowMap = {};
      for (var j = 0; j < headers.length; j++) {
        rowMap[headersLower[j]] = row[j];
      }

      function getCol() {
        for (var k = 0; k < arguments.length; k++) {
          var key = String(arguments[k]).toLowerCase().trim();
          if (rowMap[key] !== undefined && rowMap[key] !== null && rowMap[key] !== "") {
            return rowMap[key];
          }
        }
        return "";
      }

      var nroTicket = String(getCol("nro. tickect", "nro. ticket", "nro ticket", "ticket") || row[0] || "").trim();
      if (!nroTicket) continue;

        var estadoVal = String(getCol("estado del ticket", "estado") || "ABIERTO").toUpperCase().trim();
        var obsAsigVal = String(getCol("observaciones asignacion", "observaciones asignación", "observaciones de asignacion", "observaciones coordinador") || "");
        var respVal = String(getCol("respuesta", "diagnostico", "diagnóstico") || "");
        // Si el ticket está en PROCESO y no hay obsAsigVal pero respVal existe, respVal era la indicación del coordinador al asignar
        if (!obsAsigVal && estadoVal === "PROCESO" && respVal) {
          obsAsigVal = respVal;
          respVal = "";
        }

        var ticketObj = {
          _rowIndex: i + 1,
          nroTicket: nroTicket,
          fechaIngreso: formatFecha(getCol("fecha de ingreso", "fecha ingreso")),
          tipoTicket: String(getCol("tipo de ticket", "tipo ticket") || ""),
          cedulaSolicitante: String(getCol("cedula", "cédula") || ""),
          nombreUsuario: String(getCol("nombre de usuario", "nombre solicitante", "solicitante") || ""),
          emailSolicitante: String(getCol("dirección de correo electrónico", "direccion de correo electronico", "correo", "email") || ""),
          puntoServicio: String(getCol("punto de servicio del cual requiere el soporte ", "punto de servicio del cual requiere el soporte", "punto de servicio", "punto") || ""),
          tipoServicio: String(getCol("tipo de servicio", "tipo servicio") || ""),
          descripcionSolicitud: String(getCol("haga una breve descripción del soporte solicitado ", "haga una breve descripción del soporte solicitado", "haga una breve descripcion del soporte solicitado ", "haga una breve descripcion del soporte solicitado", "descripcion", "descripción") || ""),
          placa: String(getCol("placa") || ""),
          descripcionEquipo: String(getCol("descripcion del equipo", "descripción del equipo", "equipo") || ""),
          estado: estadoVal,
          fechaAsignacion: formatFecha(getCol("fecha asignacion", "fecha asignación")),
          fechaVisita: formatFecha(getCol("fecha visita", "fecha programada")),
          cedulaResponsable: String(getCol("cedula responsable", "cédula responsable") || ""),
          responsable: String(getCol("responsable", "tecnico responsable", "técnico responsable") || ""),
          celularResponsable: String(getCol("celular tecnico", "celular técnico", "celular") || ""),
          observacionesAsignacion: obsAsigVal,
          tecnicaMantenimiento: String(getCol("tecnica mantenimiento", "técnica mantenimiento", "asunto de soporte") || ""),
          fechaCierre: formatFecha(getCol("fecha de cierre", "fecha cierre")),
          nivelServicio: String(getCol("nivel de servicio", "nivel servicio") || "MEDIO"),
          repuesto: String(getCol("repuesto", "repuestos") || ""),
          respuesta: respVal,
        cedulaQuienRecibe: String(getCol("cedula de quien recibe", "cédula de quien recibe") || ""),
        nombreQuienRecibe: String(getCol("nombre de quien recibe") || ""),
        tipoFalla: String(getCol("tipo de falla", "tipo falla") || ""),
        equipoEnFuncionamiento: (function() {
          var v = String(getCol("equipo en funcionamiento")).toUpperCase();
          return v === "SI" || v === "SÍ" || v === "TRUE";
        })(),
        razonNoFuncionamiento: String(getCol("razon no funcionamiento", "razón no funcionamiento") || ""),
        celularSolicitante: String(getCol("celular solicitante", "celular del solicitante") || ""),
        fotoCierreUrl: String(getCol("foto cierre", "foto_cierre", "foto final") || ""),
        fotoSolicitudUrl: String(getCol("foto solicitud", "foto_solicitud", "evidencia", "foto") || ""),
        ans: String(getCol("ans") || ""),
        // Campos exclusivos de la Administradora
        costo: String(getCol("costo", "costos", "valor") || ""),
        aprobacion: String(getCol("aprobacion", "aprobación", "estado aprobacion") || ""),
        obsAdmin: String(getCol("obs admin", "observacion admin", "observación admin", "observaciones admin", "obs_admin") || ""),
        consultaAdmin: String(getCol("consulta admin", "consulta_admin", "consulta") || ""),
        proveedor: String(getCol("proveedor", "proveedores") || "")
      };

      ticketObj.area = deducirAreaPorServicio(ticketObj.tipoServicio, ticketObj.nroTicket);

      // Filtros
      if (filtros.area && filtros.area !== "TODAS") {
        var fAreaNorm = String(filtros.area).toUpperCase().trim();
        var tAreaNorm = String(ticketObj.area).toUpperCase().trim();
        if (fAreaNorm.indexOf("MTO") !== -1 || fAreaNorm.indexOf("MANTEN") !== -1) fAreaNorm = "MANTENIMIENTO";
        if (tAreaNorm.indexOf("MTO") !== -1 || tAreaNorm.indexOf("MANTEN") !== -1) tAreaNorm = "MANTENIMIENTO";
        if (fAreaNorm !== tAreaNorm) {
          continue;
        }
      }
      if (filtros.estado && filtros.estado !== "TODOS" && ticketObj.estado.toUpperCase() !== filtros.estado.toUpperCase()) {
        continue;
      }
      if (filtros.cedulaSolicitante && String(ticketObj.cedulaSolicitante) !== String(filtros.cedulaSolicitante)) {
        continue;
      }
      if (filtros.cedulaResponsable && String(ticketObj.cedulaResponsable) !== String(filtros.cedulaResponsable)) {
        continue;
      }
      if (filtros.busqueda) {
        var q = String(filtros.busqueda).toLowerCase();
        var match = ticketObj.nroTicket.toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.placa).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.descripcionEquipo).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.descripcionSolicitud).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.nombreUsuario).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.puntoServicio).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.responsable).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.proveedor).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.costo).toLowerCase().indexOf(q) !== -1 ||
                    String(ticketObj.aprobacion).toLowerCase().indexOf(q) !== -1;
        if (!match) continue;
      }

      tickets.push(ticketObj);
    }

    tickets.reverse();
    return JSON.parse(JSON.stringify({ success: true, tickets: tickets }));
  } catch (error) {
    Logger.log("Error en obtenerTickets: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * 1. SOLICITUD DE TICKET (Llenado por el Empleado)
 */
function crearTicket(ticketData) {
  try {
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var now = new Date();
    var timezone = CONFIG.TIMEZONE || "America/Bogota";
    var fechaStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");
    var anio = Utilities.formatDate(now, timezone, "yyyy");
    var mes = Utilities.formatDate(now, timezone, "MM");
    var dia = Utilities.formatDate(now, timezone, "dd");
    var yearMonth = anio + mes;

    var prefijo = (ticketData.area === "TIC") ? "TIC" : "MTO";
    var nroTicket = generarConsecutivoTicket(sheet, prefijo, yearMonth);

    var urlImagenSolicitud = "";
    if (ticketData.imagenBase64) {
      urlImagenSolicitud = guardarArchivoEnDrive(ticketData.imagenBase64, ticketData.imagenNombre || ("adjunto_" + nroTicket + ".jpg"), nroTicket);
    }

    var nuevaFila = [
      nroTicket,                                         // [A] Nro. Tickect
      fechaStr,                                          // [B] fecha de ingreso
      ticketData.tipoTicket || "Incidente",              // [C] Tipo de ticket
      ticketData.cedulaSolicitante,                      // [D] cedula
      ticketData.nombreUsuario,                          // [E] Nombre de Usuario
      ticketData.emailSolicitante,                       // [F] Dirección de correo electrónico
      ticketData.puntoServicio,                          // [G] Punto de servicio
      ticketData.tipoServicio,                           // [H] Tipo de servicio
      ticketData.descripcionSolicitud,                   // [I] Breve descripción
      ticketData.placa || "N/A",                         // [J] Placa
      ticketData.descripcionEquipo || "",                // [K] descripcion del equipo
      "ABIERTO",                                         // [L] Estado del ticket
      "",                                                // [M] fecha asignacion
      "",                                                // [N] Cedula responsable
      "",                                                // [O] Responsable
      "",                                                // [P] Celular
      "",                                                // [Q] Fecha de Cierre
      ticketData.nivelServicio || "MEDIO",               // [R] Nivel de Servicio
      "",                                                // [S] Repuesto
      "",                                                // [T] Respuesta
      "",                                                // [U] Cedula de quien recibe
      "",                                                // [V] Nombre de quien recibe
      anio,                                              // [W] año(ingreso)
      mes,                                               // [X] Mes(Ingreso)
      dia,                                               // [Y] Dia(Ingreso)
      "",                                                // [Z] Año(Cierre)
      "",                                                // [AA] Mes(Cierre)
      "",                                                // [AB] Dia(Cierre)
      ""                                                 // [AC] ANS
    ];

    sheet.appendRow(nuevaFila);

    // Guardar URL de la foto de la solicitud en la columna correspondiente
    var colFotoSolicitud = obtenerOcrearColumna(sheet, "Foto Solicitud");
    obtenerOcrearColumna(sheet, "Foto Cierre"); // Asegura que la columna de cierre también exista
    var colCelularSolicitante = obtenerOcrearColumna(sheet, "Celular Solicitante"); // Celular del solicitante
    var filaCreada = sheet.getLastRow();
    if (urlImagenSolicitud) {
      sheet.getRange(filaCreada, colFotoSolicitud).setValue(urlImagenSolicitud);
    }
    if (ticketData.celularSolicitante) {
      sheet.getRange(filaCreada, colCelularSolicitante).setValue(String(ticketData.celularSolicitante).trim());
    }

    // Notificación por correo al Solicitante y Coordinador
    try {
      var emailSolCrear = ticketData.emailSolicitante || "";
      if (!emailSolCrear && ticketData.cedulaSolicitante) {
        emailSolCrear = obtenerEmailPorCedula(ticketData.cedulaSolicitante);
      }

      enviarNotificacionCreacionTicket({
        nroTicket: nroTicket,
        fecha: fechaStr,
        solicitante: ticketData.nombreUsuario,
        cedula: ticketData.cedulaSolicitante,
        celular: ticketData.celularSolicitante || "",
        punto: ticketData.puntoServicio,
        area: ticketData.area,
        tipoServicio: ticketData.tipoServicio,
        equipo: ticketData.descripcionEquipo,
        placa: ticketData.placa,
        descripcion: ticketData.descripcionSolicitud,
        emailSolicitante: emailSolCrear,
        imagenUrl: urlImagenSolicitud || ""
      });
    } catch (eEmail) {
      Logger.log("Aviso: Correo de creación no enviado: " + eEmail.message);
    }

    return {
      success: true,
      nroTicket: nroTicket,
      message: "Ticket " + nroTicket + " registrado exitosamente. Se ha notificado al Coordinador."
    };
  } catch (error) {
    Logger.log("Error en crearTicket: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * 2. ASIGNACIÓN DEL TICKET (Llenado por el Coordinador)
 */
function asignarTicket(asignacionData) {
  try {
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var filaEncontrada = buscarFilaPorTicket(sheet, asignacionData.nroTicket);
    if (!filaEncontrada) {
      return { success: false, message: "Ticket no encontrado: " + asignacionData.nroTicket };
    }

    var now = new Date();
    var timezone = CONFIG.TIMEZONE || "America/Bogota";
    var fechaAsigStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");

    sheet.getRange(filaEncontrada, 12).setValue("PROCESO"); // Estado
    sheet.getRange(filaEncontrada, 13).setValue(fechaAsigStr); // Fecha Asignación
    sheet.getRange(filaEncontrada, 14).setValue(String(asignacionData.cedulaTecnico || ""));
    sheet.getRange(filaEncontrada, 15).setValue(String(asignacionData.nombreTecnico || ""));
    sheet.getRange(filaEncontrada, 16).setValue(String(asignacionData.celularTecnico || ""));

    // Guardar fecha de visita programada y celular en columnas dinámicas (protegido contra fallos)
    try {
      if (asignacionData.fechaVisita) {
        var colFechaVisita = obtenerOcrearColumna(sheet, "fecha visita");
        sheet.getRange(filaEncontrada, colFechaVisita).setValue(String(asignacionData.fechaVisita));
      }
      var colCelTecnico = obtenerOcrearColumna(sheet, "Celular Tecnico");
      sheet.getRange(filaEncontrada, colCelTecnico).setValue(String(asignacionData.celularTecnico || ""));
    } catch (eCols) {
      Logger.log("Aviso: no se pudieron escribir columnas dinámicas de visita/celular: " + eCols.message);
    }

    if (asignacionData.observacionesTrabajo) {
      try {
        var colObsAsig = obtenerOcrearColumna(sheet, "Observaciones Asignacion");
        sheet.getRange(filaEncontrada, colObsAsig).setValue(String(asignacionData.observacionesTrabajo));
      } catch (eObs) {
        Logger.log("Aviso: no se pudo escribir observaciones en columna Observaciones Asignacion: " + eObs.message);
      }
    }

    // Notificar al técnico asignado, al solicitante y al coordinador
    try {
      var emailSolAsig = asignacionData.emailSolicitante || "";
      var cedulaSolAsig = asignacionData.cedulaSolicitante || "";
      try {
        if (!emailSolAsig) {
          emailSolAsig = String(sheet.getRange(filaEncontrada, 6).getValue() || "").trim();
        }
        if (!cedulaSolAsig) {
          cedulaSolAsig = String(sheet.getRange(filaEncontrada, 4).getValue() || "").trim();
        }
        if (!emailSolAsig && cedulaSolAsig) {
          emailSolAsig = obtenerEmailPorCedula(cedulaSolAsig);
        }
      } catch(eR) {}

      var tipoServicioTicket = String(sheet.getRange(filaEncontrada, 9).getValue() || "").trim();
      var areaTicketAsig = asignacionData.area || deducirAreaPorServicio(asignacionData.tipoServicio || tipoServicioTicket, asignacionData.nroTicket);

      var emailTecAsig = asignacionData.emailTecnico || "";
      if (!emailTecAsig && asignacionData.cedulaTecnico) {
        emailTecAsig = obtenerEmailPorCedula(asignacionData.cedulaTecnico);
      }
      if (!emailTecAsig && asignacionData.nombreTecnico) {
        emailTecAsig = obtenerEmailPorNombre(asignacionData.nombreTecnico);
      }

      enviarNotificacionAsignacionTecnico({
        nroTicket: asignacionData.nroTicket,
        area: areaTicketAsig,
        tecnicoNombre: asignacionData.nombreTecnico,
        tecnicoEmail: emailTecAsig,
        cedulaTecnico: asignacionData.cedulaTecnico,
        emailSolicitante: emailSolAsig,
        cedulaSolicitante: cedulaSolAsig,
        fechaVisita: asignacionData.fechaVisita,
        observaciones: asignacionData.observacionesTrabajo,
        punto: asignacionData.puntoServicio,
        equipo: asignacionData.equipo,
        placa: asignacionData.placa,
        descripcion: asignacionData.descripcionSolicitud,
        celularSolicitante: asignacionData.celularSolicitante || (function() {
          try {
            var colCel = obtenerOcrearColumna(sheet, "Celular Solicitante");
            return String(sheet.getRange(filaEncontrada, colCel).getValue() || "");
          } catch(e) { return ""; }
        })()
      });
    } catch (eEmail) {
      Logger.log("Aviso: Correo de asignación no enviado: " + eEmail.message);
    }

    return JSON.parse(JSON.stringify({
      success: true,
      message: "Ticket " + asignacionData.nroTicket + " asignado correctamente al técnico " + (asignacionData.nombreTecnico || "") + "."
    }));
  } catch (error) {
    Logger.log("Error en asignarTicket: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * 3. CIERRE DEL TICKET (Llenado por el Técnico)
 * Permite modificar placa, foto final, validar estado operativo, generar PDF y notificar por correo.
 */
function cerrarTicket(cierreData) {
  try {
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var filaEncontrada = buscarFilaPorTicket(sheet, cierreData.nroTicket);
    if (!filaEncontrada) {
      return { success: false, message: "Ticket no encontrado: " + cierreData.nroTicket };
    }

    var now = new Date();
    var timezone = CONFIG.TIMEZONE || "America/Bogota";
    var fechaCierreStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");
    var anioCierre = Utilities.formatDate(now, timezone, "yyyy");
    var mesCierre = Utilities.formatDate(now, timezone, "MM");
    var diaCierre = Utilities.formatDate(now, timezone, "dd");

    // Guardar foto si viene en base64
    var urlFotoCierre = "";
    if (cierreData.fotoBase64) {
      urlFotoCierre = guardarArchivoEnDrive(cierreData.fotoBase64, "cierre_" + cierreData.nroTicket + ".jpg", cierreData.nroTicket);
      if (urlFotoCierre) {
        var colFotoCierre = obtenerOcrearColumna(sheet, "Foto Cierre");
        sheet.getRange(filaEncontrada, colFotoCierre).setValue(urlFotoCierre);
      }
    }

    // 1. Modificar placa si el técnico la corrigió o actualizó
    if (cierreData.placaModificada && cierreData.placaModificada.trim() !== "") {
      sheet.getRange(filaEncontrada, 10).setValue(cierreData.placaModificada.trim());
    }

    // 2. Estado final: si no queda operativo o se seleccionó PENDIENTE, es estrictamente PENDIENTE (no se cierra)
    var estadoFinal = String(cierreData.estado || "").toUpperCase().trim();
    if (!cierreData.equipoEnFuncionamiento || estadoFinal === "PENDIENTE") {
      estadoFinal = "PENDIENTE";
    } else if (!estadoFinal) {
      estadoFinal = "CERRADO";
    }
    sheet.getRange(filaEncontrada, 12).setValue(estadoFinal);

    // 3. Fecha Cierre y Repuestos
    if (estadoFinal === "CERRADO") {
      sheet.getRange(filaEncontrada, 17).setValue(fechaCierreStr);
      sheet.getRange(filaEncontrada, 26).setValue(anioCierre);
      sheet.getRange(filaEncontrada, 27).setValue(mesCierre);
      sheet.getRange(filaEncontrada, 28).setValue(diaCierre);
    } else {
      // PENDIENTE: NO SE CIERRA. Dejar columnas de cierre vacías para que no cuente como cerrado
      sheet.getRange(filaEncontrada, 17).setValue("");
      sheet.getRange(filaEncontrada, 26).setValue("");
      sheet.getRange(filaEncontrada, 27).setValue("");
      sheet.getRange(filaEncontrada, 28).setValue("");
    }
    sheet.getRange(filaEncontrada, 19).setValue(cierreData.repuestosUsados || "Ninguno");

    // 4. Observación del trabajo realizado / Respuesta final
    var obsFinal = cierreData.observacionTrabajo || "";
    if (estadoFinal === "PENDIENTE" && cierreData.razonNoFuncionamiento) {
      obsFinal = "[PENDIENTE: " + cierreData.razonNoFuncionamiento + "] " + obsFinal;
    } else if (!cierreData.equipoEnFuncionamiento && cierreData.razonNoFuncionamiento) {
      obsFinal += " | Razón no funcionamiento: " + cierreData.razonNoFuncionamiento;
    }
    sheet.getRange(filaEncontrada, 20).setValue(obsFinal);

    // 5. Quien recibe (Traído automáticamente de quien creó la incidencia/ticket)
    var cedulaSolicitanteTicket = String(sheet.getRange(filaEncontrada, 4).getValue() || "").trim();
    var nombreSolicitanteTicket = String(sheet.getRange(filaEncontrada, 5).getValue() || "").trim();
    var cedulaReceptor = cierreData.cedulaQuienRecibe || cedulaSolicitanteTicket;
    var nombreReceptor = cierreData.quienRecibe || nombreSolicitanteTicket;
    sheet.getRange(filaEncontrada, 21).setValue(cedulaReceptor);
    sheet.getRange(filaEncontrada, 22).setValue(nombreReceptor);

    // 6. Guardar tipo de falla, equipo en funcionamiento y razón de no funcionamiento
    if (cierreData.tipoFalla) {
      var colTipoFalla = obtenerOcrearColumna(sheet, "tipo de falla");
      sheet.getRange(filaEncontrada, colTipoFalla).setValue(cierreData.tipoFalla);
    }
    var colEquipoFunc = obtenerOcrearColumna(sheet, "equipo en funcionamiento");
    sheet.getRange(filaEncontrada, colEquipoFunc).setValue(cierreData.equipoEnFuncionamiento ? "SI" : "NO");

    var colRazon = obtenerOcrearColumna(sheet, "razon no funcionamiento");
    sheet.getRange(filaEncontrada, colRazon).setValue(cierreData.razonNoFuncionamiento || "");

    // 7. ANS
    if (estadoFinal === "CERRADO") {
      var fechaIngresoVal = sheet.getRange(filaEncontrada, 2).getValue();
      var ansCalculado = calcularANS(fechaIngresoVal, now);
      sheet.getRange(filaEncontrada, 29).setValue(ansCalculado);
    } else {
      sheet.getRange(filaEncontrada, 29).setValue("PENDIENTE");
    }

    // 8. Generar PDF — SOLO cuando el ticket queda CERRADO, no si está PENDIENTE
    var pdfBlob = null;
    if (estadoFinal === "CERRADO") {
      try {
        var ticketCompleto = obtenerDetalleTicketPorFila(sheet, filaEncontrada);
        pdfBlob = generarDocumentoPDF(ticketCompleto);
      } catch (ePdf) {
        Logger.log("Aviso: No se pudo generar PDF: " + ePdf.message);
      }
    }

    // 9. Enviar correo a los 3 involucrados: Solicitante, Coordinador y Técnico
    try {
      var emailSolCierre = cierreData.emailSolicitante || "";
      var cedulaSolCierre = cierreData.cedulaSolicitante || "";
      var emailTecCierre = cierreData.emailTecnico || "";
      var cedulaTecCierre = cierreData.cedulaTecnico || "";

      try {
        if (!emailSolCierre) {
          emailSolCierre = String(sheet.getRange(filaEncontrada, 6).getValue() || "").trim();
        }
        if (!cedulaSolCierre) {
          cedulaSolCierre = String(sheet.getRange(filaEncontrada, 4).getValue() || "").trim();
        }
        if (!emailSolCierre && cedulaSolCierre) {
          emailSolCierre = obtenerEmailPorCedula(cedulaSolCierre);
        }
        if (!cedulaTecCierre) {
          cedulaTecCierre = String(sheet.getRange(filaEncontrada, 14).getValue() || "").trim();
        }
        if (!emailTecCierre && cedulaTecCierre) {
          emailTecCierre = obtenerEmailPorCedula(cedulaTecCierre);
        }
      } catch (eR2) {}

      var areaTicketCierre = deducirAreaPorServicio(cierreData.tipoServicio, cierreData.nroTicket);

      enviarNotificacionCierreTicket({
        nroTicket: cierreData.nroTicket,
        area: areaTicketCierre,
        punto: cierreData.puntoServicio,
        emailSolicitante: emailSolCierre,
        cedulaSolicitante: cedulaSolCierre,
        emailTecnico: emailTecCierre,
        cedulaTecnico: cedulaTecCierre,
        estado: estadoFinal,
        tecnico: cierreData.nombreTecnico,
        equipo: cierreData.equipo,
        placa: cierreData.placaModificada || cierreData.placa,
        equipoEnFuncionamiento: cierreData.equipoEnFuncionamiento,
        razonNoFuncionamiento: cierreData.razonNoFuncionamiento,
        observacion: cierreData.observacionTrabajo,
        quienRecibe: nombreReceptor || cierreData.quienRecibe,
        pdfBlob: pdfBlob   // null si es PENDIENTE => no se adjunta acta
      });
    } catch (eEmail) {
      Logger.log("Aviso: Correo de cierre no enviado: " + eEmail.message);
    }

    var mensajeRetorno = (estadoFinal === "PENDIENTE")
      ? "Ticket " + cierreData.nroTicket + " registrado en estado PENDIENTE (No se cerró el ticket y queda pendiente de solución)."
      : "Ticket " + cierreData.nroTicket + " CERRADO exitosamente. Se generó y envió el acta de entrega técnica en PDF.";

    return {
      success: true,
      estado: estadoFinal,
      message: mensajeRetorno
    };
  } catch (error) {
    Logger.log("Error en cerrarTicket: " + error.message);
    return { success: false, message: error.message };
  }
}

/**
 * 4. MODIFICACIÓN DIRECTA DE LA PLACA
 */
function modificarPlaca(nroTicket, nuevaPlaca) {
  try {
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var fila = buscarFilaPorTicket(sheet, nroTicket);
    if (!fila) {
      return { success: false, message: "Ticket no encontrado." };
    }
    sheet.getRange(fila, 10).setValue(nuevaPlaca.trim());
    return { success: true, message: "Placa actualizada a: " + nuevaPlaca };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// ============================================================================
// 6. GENERACIÓN DE ACTA Y REPORTE EN PDF
// ============================================================================
function generarDocumentoPDF(ticket) {
  var html = '' +
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<style>' +
    '  body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 20px; line-height: 1.4; }' +
    '  .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }' +
    '  .company-title { font-size: 18px; font-weight: bold; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }' +
    '  .sub-title { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 2px; }' +
    '  .ticket-badge { background-color: #0f172a; color: #ffffff; padding: 6px 12px; font-size: 13px; font-weight: bold; border-radius: 4px; display: inline-block; }' +
    '  .section-title { background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 5px 8px; font-size: 11px; font-weight: bold; color: #0f172a; margin-top: 14px; margin-bottom: 8px; text-transform: uppercase; }' +
    '  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }' +
    '  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10.5px; text-align: left; }' +
    '  th { background-color: #f8fafc; font-weight: bold; color: #334155; width: 25%; }' +
    '  .badge { padding: 3px 8px; border-radius: 3px; font-weight: bold; font-size: 10px; }' +
    '  .badge-success { background: #dcfce7; color: #15803d; }' +
    '  .badge-danger { background: #fee2e2; color: #b91c1c; }' +
    '  .signatures { margin-top: 40px; width: 100%; }' +
    '  .signature-box { border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; width: 45%; float: left; margin-right: 5%; }' +
    '  .footer { margin-top: 30px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '  <div class="header">' +
    '    <div>' +
    '      <div class="company-title">DIALIMENTOS S.A.S.</div>' +
    '      <div class="sub-title">ACTA DE SERVICIO TÉCNICO & MANTENIMIENTO</div>' +
    '    </div>' +
    '    <div style="text-align: right;">' +
    '      <div class="ticket-badge">' + (ticket.nroTicket || "TICKET") + '</div>' +
    '      <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Fecha: ' + (ticket.fechaCierre || ticket.fechaIngreso) + '</div>' +
    '    </div>' +
    '  </div>' +

    '  <div class="section-title">1. INFORMACIÓN DE LA SOLICITUD</div>' +
    '  <table>' +
    '    <tr><th>Punto de Servicio:</th><td>' + (ticket.puntoServicio || "") + '</td><th>Tipo de Ticket:</th><td>' + (ticket.tipoTicket || "") + '</td></tr>' +
    '    <tr><th>Solicitante:</th><td>' + (ticket.nombreUsuario || "") + '</td><th>Cédula:</th><td>' + (ticket.cedulaSolicitante || "") + '</td></tr>' +
    '    <tr><th>Correo Contacto:</th><td>' + (ticket.emailSolicitante || "") + '</td><th>Teléfono Solicitante:</th><td><strong>' + (ticket.celularSolicitante || "N/A") + '</strong></td></tr>' +
    '    <tr><th>Tipo de Servicio:</th><td>' + (ticket.tipoServicio || "") + '</td><th>Fecha Solicitud:</th><td>' + (ticket.fechaIngreso || "") + '</td></tr>' +
    '    <tr><th>Nivel de Servicio:</th><td>' + (ticket.nivelServicio || "MEDIO") + '</td><th>Placa Activo Fijo:</th><td><strong>' + (ticket.placa || "N/A") + '</strong></td></tr>' +
    '    <tr><th>Equipo Intervenido:</th><td colspan="3">' + (ticket.descripcionEquipo || "") + '</td></tr>' +
    '    <tr><th>Descripción Solicitud:</th><td colspan="3">' + (ticket.descripcionSolicitud || "") + '</td></tr>' +
    '  </table>' +

    '  <div class="section-title">2. GESTIÓN Y ASIGNACIÓN</div>' +
    '  <table>' +
    '    <tr><th>Técnico Responsable:</th><td>' + (ticket.responsable || "") + '</td><th>Cédula Técnico:</th><td>' + (ticket.cedulaResponsable || "") + '</td></tr>' +
    '    <tr><th>Teléfono Técnico:</th><td>' + (ticket.celularResponsable || "") + '</td><th>Fecha Asignación:</th><td>' + (ticket.fechaAsignacion || "") + '</td></tr>' +
    '    <tr><th>Fecha de Visita:</th><td>' + (ticket.fechaVisita || "") + '</td><th>Técnica Mantenimiento:</th><td>' + (ticket.tecnicaMantenimiento || "Correctivo en sitio") + '</td></tr>' +
    '    <tr><th>Observaciones Trabajo:</th><td colspan="3">' + (ticket.observacionesAsignacion || "Sin observaciones") + '</td></tr>' +
    '  </table>' +

    '  <div class="section-title">3. CIERRE DEL SERVICIO Y RESULTADOS</div>' +
    '  <table>' +
    '    <tr><th>Fecha de Terminación:</th><td>' + (ticket.fechaCierre || "") + '</td><th>Estado Final:</th><td><strong>' + (ticket.estado || "CERRADO") + '</strong></td></tr>' +
    '    <tr><th>Tipo de Falla:</th><td>' + (ticket.tipoFalla || "No especificada") + '</td><th>Repuestos / Insumos:</th><td>' + (ticket.repuesto || "Ninguno") + '</td></tr>' +
    '    <tr><th>¿Equipo en Funcionamiento?:</th><td colspan="3">' +
           (ticket.equipoEnFuncionamiento ? '<span class="badge badge-success">SÍ, OPERATIVO</span>' : '<span class="badge badge-danger">NO OPERATIVO</span> - Motivo: ' + (ticket.razonNoFuncionamiento || "Por determinar")) +
         '</td></tr>' +
    '    <tr><th>Trabajo Realizado:</th><td colspan="3">' + (ticket.respuesta || "Trabajo finalizado a satisfacción") + '</td></tr>' +
    '    <tr><th>Recibido Por (Solicitante):</th><td>' + (ticket.nombreUsuario || ticket.nombreQuienRecibe || "") + '</td><th>Cédula Solicitante:</th><td>' + (ticket.cedulaSolicitante || ticket.cedulaQuienRecibe || "") + '</td></tr>' +
    '  </table>' +

    '  <table class="signatures" style="border: none; margin-top: 50px;">' +
    '    <tr style="border: none;">' +
    '      <td style="border: none; width: 50%; text-align: center; vertical-align: bottom; padding: 20px;">' +
    '        <div style="border-top: 1px solid #334155; padding-top: 6px; width: 80%; margin: 0 auto;">' +
    '          <strong>' + (ticket.responsable || "TÉCNICO RESPONSABLE") + '</strong><br>' +
    '          C.C. ' + (ticket.cedulaResponsable || "") + '<br>' +
    '          Técnico Asignado' +
    '        </div>' +
    '      </td>' +
    '      <td style="border: none; width: 50%; text-align: center; vertical-align: bottom; padding: 20px;">' +
    '        <div style="border-top: 1px solid #334155; padding-top: 6px; width: 80%; margin: 0 auto;">' +
    '          <strong>' + (ticket.nombreUsuario || ticket.nombreQuienRecibe || "SOLICITANTE / RESPONSABLE") + '</strong><br>' +
    '          C.C. ' + (ticket.cedulaSolicitante || ticket.cedulaQuienRecibe || "") + '<br>' +
    '          Solicitante / Responsable de Punto' +
    '        </div>' +
    '      </td>' +
    '    </tr>' +
    '  </table>' +

    '  <div class="footer">' +
    '    Documento generado automáticamente por el Sistema de Mesa de Ayuda de Dialimentos S.A.S. - ' + (ticket.fechaCierre || "") +
    '  </div>' +
    '</body>' +
    '</html>';

  var blob = Utilities.newBlob(html, "text/html", "Acta_" + (ticket.nroTicket || "Ticket") + ".html");
  return blob.getAs("application/pdf").setName("Acta_" + (ticket.nroTicket || "Ticket") + ".pdf");
}

/**
 * Genera y retorna el acta oficial en formato PDF base64 para descarga directa
 */
function obtenerActaPdf(nroTicket) {
  try {
    if (!nroTicket) {
      return { success: false, message: "Número de ticket no proporcionado" };
    }
    var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
    var fila = buscarFilaPorTicket(sheet, nroTicket);
    if (!fila) {
      return { success: false, message: "Ticket no encontrado: " + nroTicket };
    }
    var ticket = obtenerDetalleTicketPorFila(sheet, fila);
    var pdfBlob = generarDocumentoPDF(ticket);
    var base64 = Utilities.base64Encode(pdfBlob.getBytes());
    return {
      success: true,
      nroTicket: nroTicket,
      filename: "Acta_" + nroTicket + ".pdf",
      base64: base64
    };
  } catch (err) {
    Logger.log("Error en obtenerActaPdf: " + err.message);
    return { success: false, message: "Error al generar acta en PDF: " + err.message };
  }
}

// ============================================================================
// 7. NOTIFICACIONES POR CORREO ELECTRÓNICO (GmailApp / MailApp)
// ============================================================================

function esEmailValido(email) {
  if (!email || typeof email !== "string") return false;
  var str = email.trim();
  return str.indexOf("@") > 0 && str.indexOf(".") > 0 && str.indexOf(" ") === -1;
}

/**
 * Busca el email de un empleado por su número de cédula en la hoja EMPLEADOS.
 */
function obtenerEmailPorCedula(cedula) {
  if (!cedula) return "";
  try {
    var empleados = sheetToJson(CONFIG.SHEETS.EMPLEADOS);
    var cedBuscada = String(cedula).replace(/[^0-9]/g, "");
    for (var i = 0; i < empleados.length; i++) {
      var emp = empleados[i];
      var cedEmp = String(emp["CEDULA"] || "").replace(/[^0-9]/g, "");
      if (cedEmp === cedBuscada && cedBuscada !== "") {
        return String(emp["EMAIL"] || emp["CORREO"] || emp["Email"] || emp["Dirección de correo electrónico"] || "").trim();
      }
    }
  } catch (e) {
    Logger.log("Error en obtenerEmailPorCedula: " + e.message);
  }
  return "";
}

/**
 * Busca el correo de un empleado por su nombre en la hoja EMPLEADOS.
 */
function obtenerEmailPorNombre(nombre) {
  try {
    if (!nombre) return "";
    var empleados = sheetToJson(CONFIG.SHEETS.EMPLEADOS);
    var nomLimpio = String(nombre).toLowerCase().trim();
    for (var i = 0; i < empleados.length; i++) {
      var emp = empleados[i];
      var nomEmp = String(emp["NOMBRES APELLIDOS"] || emp["NOMBRE"] || "").toLowerCase().trim();
      if (nomEmp === nomLimpio || (nomEmp.length > 3 && nomLimpio.indexOf(nomEmp) !== -1) || (nomLimpio.length > 3 && nomEmp.indexOf(nomLimpio) !== -1)) {
        return String(emp["EMAIL"] || emp["CORREO"] || "").trim();
      }
    }
  } catch(e) {
    Logger.log("Error en obtenerEmailPorNombre: " + e.message);
  }
  return "";
}

/**
 * Retorna el correo principal del coordinador según el área o prefijo del ticket (TIC vs Mantenimiento).
 */
function obtenerEmailCoordinador(area, nroTicket) {
  var correos = obtenerEmailsCoordinacion(area, nroTicket);
  return correos.length > 0 ? correos[0] : CONFIG.COORDINADOR_MTO_EMAIL;
}

/**
 * Retorna ÚNICAMENTE el correo de coordinación correspondiente al área del ticket.
 * Estricta separación: TIC NUNCA va a Mantenimiento, y Mantenimiento NUNCA va a TIC.
 */
function obtenerEmailsCoordinacion(area, nroTicket) {
  var areaNorm = String(area || "").toUpperCase().trim();
  var esTIC = (nroTicket && String(nroTicket).indexOf("TIC-") === 0) || 
              areaNorm === "TIC" || 
              areaNorm.indexOf("SISTEMA") !== -1 || 
              areaNorm.indexOf("TECNOLOG") !== -1;

  if (esTIC) {
    // Para tickets de TIC: única y exclusivamente soporte TIC
    return [CONFIG.COORDINADOR_TIC_EMAIL];
  } else {
    // Para tickets de Mantenimiento: única y exclusivamente coordinación MTO
    return [CONFIG.COORDINADOR_MTO_EMAIL];
  }
}

/**
 * Envío directo y seguro de correos a todos los destinatarios involucrados.
 * Garantiza que absolutamente todos los correos en la lista reciban el mensaje (Técnico, Solicitante, Administrador).
 */
function enviarCorreoSeguro(destinatarios, asunto, cuerpoHtml, opciones) {
  opciones = opciones || {};
  var toList = (Array.isArray(destinatarios) ? destinatarios : [destinatarios])
    .map(function(e) { return String(e || "").trim(); })
    .filter(esEmailValido);

  // Eliminar duplicados
  var unicos = [];
  for (var i = 0; i < toList.length; i++) {
    if (unicos.indexOf(toList[i]) === -1) {
      unicos.push(toList[i]);
    }
  }

  if (unicos.length === 0) {
    Logger.log("Aviso: No se encontraron destinatarios válidos para el correo: " + asunto);
    return false;
  }

  var toStr = unicos.join(",");
  var mailParams = {
    htmlBody: cuerpoHtml,
    name: "Mesa de Ayuda Dialimentos"
  };
  if (opciones.attachments && opciones.attachments.length > 0) {
    mailParams.attachments = opciones.attachments;
  }

  Logger.log("Enviando correo [" + asunto + "] directamente a " + unicos.length + " destinatario(s): " + toStr);

  // 1. Envío directo usando GmailApp.sendEmail (cada dirección en toStr recibe el correo)
  try {
    GmailApp.sendEmail(toStr, asunto, '', mailParams);
    Logger.log("ÉXITO: Correo entregado vía GmailApp a: " + toStr);
    return true;
  } catch (eGmail) {
    Logger.log("Aviso: GmailApp.sendEmail falló (" + eGmail.message + "), intentando con MailApp...");
  }

  // 2. Fallback MailApp.sendEmail
  try {
    var mailAppParams = {
      to: toStr,
      subject: asunto,
      htmlBody: cuerpoHtml,
      name: "Mesa de Ayuda Dialimentos"
    };
    if (mailParams.attachments) {
      mailAppParams.attachments = mailParams.attachments;
    }
    MailApp.sendEmail(mailAppParams);
    Logger.log("ÉXITO: Correo entregado vía MailApp a: " + toStr);
    return true;
  } catch (eMail) {
    Logger.log("ERROR CRÍTICO enviando correo: " + eMail.message);
    return false;
  }
}

/**
 * 1. Notificación al CREAR TICKET:
 * Llega tanto al solicitante como a la Coordinación/Administración.
 */
function enviarNotificacionCreacionTicket(datos) {
  var correosCoordinacion = obtenerEmailsCoordinacion(datos.area, datos.nroTicket);
  var emailSolicitante = datos.emailSolicitante || "";
  if (!emailSolicitante && datos.cedula) {
    emailSolicitante = obtenerEmailPorCedula(datos.cedula);
  }

  var asunto = "Ticket " + datos.nroTicket + " - " + datos.punto + " (" + datos.area + ")";

  var imagenHtml = "";
  if (datos.imagenUrl) {
    imagenHtml =
      '<tr><td colspan="2" style="padding: 10px 0;">'
      + '<span style="font-weight: bold; color: #2596be;">&#128247; Evidencia fotográfica adjunta por el solicitante:</span><br>'
      + '<a href="' + datos.imagenUrl + '" target="_blank" style="display: inline-block; margin-top: 6px; background: #2596be; color: #fff; padding: 7px 16px; border-radius: 5px; text-decoration: none; font-size: 12px;">&#128247; Ver imagen en Google Drive &rarr;</a>'
      + '</td></tr>';
  }

  var cuerpoHtml =
    '<div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">'
    + '<div style="background-color: #ffffff; border-bottom: 3px solid #2596be; padding: 18px 22px;">'
    + '<h2 style="margin: 0; font-size: 17px; color: #0f172a;">Nueva Solicitud de Servicio &mdash; Dialimentos</h2>'
    + '<div style="font-size: 13px; color: #64748b; margin-top: 5px;">Ticket: <strong style="color: #2596be;">' + datos.nroTicket + '</strong></div>'
    + '</div>'
    + '<div style="padding: 20px; background: #ffffff;">'
    + '<p style="color: #475569;">Se ha registrado un nuevo ticket en el sistema que requiere asignación:</p>'
    + '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">'
    + '<tr><td style="padding: 7px 0; font-weight: bold; width: 40%; color: #0f172a;">Punto de Servicio:</td><td style="color: #334155;">' + datos.punto + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Solicitante:</td><td style="color: #334155;">' + datos.solicitante + ' (' + datos.cedula + ')</td></tr>'
    + (datos.celular ? '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">&#128222; Celular Contacto:</td><td style="color: #2596be; font-weight: bold;">' + datos.celular + '</td></tr>' : '')
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Área:</td><td style="color: #334155;">' + datos.area + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Tipo de Servicio:</td><td style="color: #334155;">' + datos.tipoServicio + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Equipo:</td><td style="color: #334155;">' + datos.equipo + ' (Placa: ' + datos.placa + ')</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Descripción:</td><td style="color: #334155;">' + datos.descripcion + '</td></tr>'
    + imagenHtml
    + '</table>'
    + '<p style="margin-top: 18px; font-size: 12px; color: #94a3b8;">Por favor ingrese al sistema para programar la visita y asignar el técnico correspondiente.</p>'
    + '</div>'
    + '</div>';

  var esTIC = (datos.nroTicket && String(datos.nroTicket).indexOf("TIC-") === 0) || 
              String(datos.area || "").toUpperCase().trim() === "TIC";

  var destinatarios = [];
  if (esEmailValido(emailSolicitante)) destinatarios.push(emailSolicitante);
  for (var i = 0; i < correosCoordinacion.length; i++) {
    if (destinatarios.indexOf(correosCoordinacion[i]) === -1) {
      destinatarios.push(correosCoordinacion[i]);
    }
  }

  // Filtro estricto entre áreas: jamás cruzar coordinadores de TIC y Mantenimiento
  destinatarios = destinatarios.filter(function(correo) {
    var cNorm = String(correo).toLowerCase().trim();
    if (esTIC) {
      if (cNorm === String(CONFIG.COORDINADOR_MTO_EMAIL).toLowerCase().trim()) return false;
    } else {
      if (cNorm === String(CONFIG.COORDINADOR_TIC_EMAIL).toLowerCase().trim()) return false;
    }
    return true;
  });

  enviarCorreoSeguro(destinatarios, '[NUEVO] ' + asunto, cuerpoHtml, { nroTicket: datos.nroTicket });
}

/**
 * 2. Notificación al ASIGNAR TICKET:
 * Llega obligatoriamente a los 3: al Técnico, al Solicitante y a la Administración/Coordinador.
 */
function enviarNotificacionAsignacionTecnico(datos) {
  var correosCoordinacion = obtenerEmailsCoordinacion(datos.area, datos.nroTicket);

  // 1. Obtener y validar correo del técnico asignado
  var emailTecnico = datos.tecnicoEmail || "";
  if (!emailTecnico && datos.cedulaTecnico) {
    emailTecnico = obtenerEmailPorCedula(datos.cedulaTecnico);
  }
  if (!emailTecnico && datos.tecnicoNombre) {
    emailTecnico = obtenerEmailPorNombre(datos.tecnicoNombre);
  }

  // 2. Obtener y validar correo del solicitante
  var emailSolicitante = datos.emailSolicitante || "";
  if (!emailSolicitante && datos.cedulaSolicitante) {
    emailSolicitante = obtenerEmailPorCedula(datos.cedulaSolicitante);
  }
  if (!emailSolicitante && datos.nroTicket) {
    try {
      var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
      var fila = buscarFilaPorTicket(sheet, datos.nroTicket);
      if (fila) {
        emailSolicitante = String(sheet.getRange(fila, 6).getValue() || "").trim();
      }
    } catch(e) {}
  }

  var asuntoBase = "Ticket " + datos.nroTicket + " - " + datos.punto;

  var cuerpoHtml =
    '<div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">'
    + '<div style="background-color: #ffffff; border-bottom: 3px solid #2596be; padding: 18px 22px;">'
    + '<h2 style="margin: 0; font-size: 17px; color: #0f172a;">Asignación de Servicio Técnico &mdash; Dialimentos</h2>'
    + '<div style="font-size: 13px; color: #64748b; margin-top: 5px;">Ticket: <strong style="color: #2596be;">' + datos.nroTicket + '</strong></div>'
    + '</div>'
    + '<div style="padding: 20px; background: #ffffff;">'
    + '<p style="color: #475569;">Se ha asignado el técnico <strong>' + (datos.tecnicoNombre || "Asignado") + '</strong> para atender el siguiente caso:</p>'
    + '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">'
    + '<tr><td style="padding: 7px 0; font-weight: bold; width: 40%; color: #0f172a;">Técnico Asignado:</td><td style="color: #334155;"><strong>' + (datos.tecnicoNombre || "") + '</strong></td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Punto de Servicio:</td><td style="color: #334155;">' + datos.punto + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Fecha Programada:</td><td style="color: #2596be; font-weight: bold;">' + (datos.fechaVisita || "Por coordinar") + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Equipo:</td><td style="color: #334155;">' + datos.equipo + ' (Placa: ' + datos.placa + ')</td></tr>'
    + (datos.celularSolicitante ? '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">&#128222; Celular del Solicitante:</td><td style="color: #2596be; font-weight: bold;">' + datos.celularSolicitante + '</td></tr>' : '')
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Problema Reportado:</td><td style="color: #334155;">' + datos.descripcion + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Observaciones del Coordinador:</td><td style="background: #f8fafc; padding: 6px; color: #334155;">' + (datos.observaciones || "Realizar diagnóstico en sitio.") + '</td></tr>'
    + '</table>'
    + '<p style="margin-top: 18px; font-size: 12px; color: #94a3b8;">Notificación enviada al técnico asignado, al solicitante y a la administración.</p>'
    + '</div>'
    + '</div>';

  var esTIC = (datos.nroTicket && String(datos.nroTicket).indexOf("TIC-") === 0) || 
              String(datos.area || "").toUpperCase().trim() === "TIC";

  var destinatarios = [];
  // 1. Técnico asignado
  if (esEmailValido(emailTecnico)) {
    destinatarios.push(emailTecnico);
  } else {
    Logger.log("ALERTA: No se pudo obtener correo válido del técnico para asignación: " + (datos.tecnicoNombre || datos.cedulaTecnico));
  }

  // 2. Solicitante
  if (esEmailValido(emailSolicitante) && destinatarios.indexOf(emailSolicitante) === -1) {
    destinatarios.push(emailSolicitante);
  }

  // 3. Administradores / Coordinación
  for (var i = 0; i < correosCoordinacion.length; i++) {
    if (destinatarios.indexOf(correosCoordinacion[i]) === -1) {
      destinatarios.push(correosCoordinacion[i]);
    }
  }

  // Filtro estricto entre áreas: jamás cruzar coordinadores de TIC y Mantenimiento
  destinatarios = destinatarios.filter(function(correo) {
    var cNorm = String(correo).toLowerCase().trim();
    if (esTIC) {
      if (cNorm === String(CONFIG.COORDINADOR_MTO_EMAIL).toLowerCase().trim()) return false;
    } else {
      if (cNorm === String(CONFIG.COORDINADOR_TIC_EMAIL).toLowerCase().trim()) return false;
    }
    return true;
  });

  Logger.log("Destinatarios asignación ticket " + datos.nroTicket + ": " + destinatarios.join(", "));
  enviarCorreoSeguro(destinatarios, '[ASIGNACIÓN] ' + asuntoBase, cuerpoHtml, { nroTicket: datos.nroTicket });
}

/**
 * 3. Notificación al CERRAR o marcar como PENDIENTE:
 * Llega obligatoriamente a los 3: al Técnico, al Solicitante y a la Administración/Coordinador.
 */
function enviarNotificacionCierreTicket(datos) {
  var correosCoordinacion = obtenerEmailsCoordinacion(datos.area, datos.nroTicket);
  var emailSolicitante = datos.emailSolicitante || "";
  if (!emailSolicitante && datos.cedulaSolicitante) {
    emailSolicitante = obtenerEmailPorCedula(datos.cedulaSolicitante);
  }
  if (!emailSolicitante && datos.nroTicket) {
    try {
      var sheet = getSheetByName(CONFIG.SHEETS.TICKETS);
      var fila = buscarFilaPorTicket(sheet, datos.nroTicket);
      if (fila) {
        emailSolicitante = String(sheet.getRange(fila, 6).getValue() || "").trim();
      }
    } catch(e) {}
  }

  var emailTecnico = datos.emailTecnico || "";
  if (!emailTecnico && datos.cedulaTecnico) {
    emailTecnico = obtenerEmailPorCedula(datos.cedulaTecnico);
  }
  if (!emailTecnico && datos.tecnico) {
    emailTecnico = obtenerEmailPorNombre(datos.tecnico);
  }

  var esTIC = (datos.nroTicket && String(datos.nroTicket).indexOf("TIC-") === 0) || 
              String(datos.area || "").toUpperCase().trim() === "TIC";

  var destinatarios = [];
  if (esEmailValido(emailSolicitante)) destinatarios.push(emailSolicitante);
  if (esEmailValido(emailTecnico) && destinatarios.indexOf(emailTecnico) === -1) {
    destinatarios.push(emailTecnico);
  }
  for (var i = 0; i < correosCoordinacion.length; i++) {
    if (destinatarios.indexOf(correosCoordinacion[i]) === -1) {
      destinatarios.push(correosCoordinacion[i]);
    }
  }
  if (datos.emailPunto && esEmailValido(datos.emailPunto) && destinatarios.indexOf(datos.emailPunto) === -1) {
    destinatarios.push(datos.emailPunto);
  }

  // Filtro estricto entre áreas: jamás cruzar coordinadores de TIC y Mantenimiento
  destinatarios = destinatarios.filter(function(correo) {
    var cNorm = String(correo).toLowerCase().trim();
    if (esTIC) {
      if (cNorm === String(CONFIG.COORDINADOR_MTO_EMAIL).toLowerCase().trim()) return false;
    } else {
      if (cNorm === String(CONFIG.COORDINADOR_TIC_EMAIL).toLowerCase().trim()) return false;
    }
    return true;
  });

  var asuntoBase = "Ticket " + datos.nroTicket + " - " + datos.punto;
  var esCerrado = String(datos.estado).toUpperCase() === "CERRADO";
  var estadoColor = esCerrado ? "#059669" : "#d97706";
  var tituloHeader = esCerrado ? "Servicio Técnico Finalizado &mdash; Dialimentos" : "Visita Realizada (Ticket PENDIENTE) &mdash; Dialimentos";
  var prefijoAsunto = esCerrado ? "[CIERRE] " : "[PENDIENTE] ";

  var cuerpoHtml =
    '<div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">'
    + '<div style="background-color: #ffffff; border-bottom: 3px solid #2596be; padding: 18px 22px;">'
    + '<h2 style="margin: 0; font-size: 17px; color: #0f172a;">' + tituloHeader + '</h2>'
    + '<div style="font-size: 13px; color: #64748b; margin-top: 5px;">Ticket: <strong style="color: #2596be;">' + datos.nroTicket + '</strong> &nbsp;|&nbsp; Estado: <strong style="color: ' + estadoColor + ';">' + datos.estado + '</strong></div>'
    + '</div>'
    + '<div style="padding: 20px; background: #ffffff;">'
    + '<p style="color: #475569;">' + (esCerrado ? 'Se ha completado a satisfacción el servicio en el punto <strong>' + datos.punto + '</strong>.' : 'Se realizó visita técnica en el punto <strong>' + datos.punto + '</strong>, pero el ticket <strong>permanece en estado PENDIENTE</strong>.') + '</p>'
    + '<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">'
    + '<tr><td style="padding: 7px 0; font-weight: bold; width: 40%; color: #0f172a;">Técnico Encargado:</td><td style="color: #334155;">' + datos.tecnico + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Equipo:</td><td style="color: #334155;">' + datos.equipo + ' (Placa: ' + datos.placa + ')</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">¿Equipo en Funcionamiento?:</td><td style="font-weight: bold; color: ' + estadoColor + ';">' + (datos.equipoEnFuncionamiento ? 'SÍ, OPERATIVO' : 'NO &mdash; Razón: ' + (datos.razonNoFuncionamiento || 'Por determinar')) + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Trabajo Realizado / Avance:</td><td style="color: #334155;">' + datos.observacion + '</td></tr>'
    + '<tr><td style="padding: 7px 0; font-weight: bold; color: #0f172a;">Recibió en Sitio:</td><td style="color: #334155;">' + datos.quienRecibe + '</td></tr>'
    + '</table>'
    + '<p style="margin-top: 18px; font-size: 12px; color: #94a3b8;">' + (esCerrado ? 'Se adjunta el <strong>Acta de Entrega Técnica en PDF</strong> con el detalle completo de la intervención.' : 'El ticket permanece <strong>PENDIENTE</strong> de solución. No se genera acta hasta que sea cerrado formalmente.') + '</p>'
    + '<p style="margin-top: 8px; font-size: 12px; color: #94a3b8;">Notificación enviada al solicitante, al técnico y a la administración.</p>'
    + '</div>'
    + '</div>';

  var opcionesEnvio = {
    nroTicket: datos.nroTicket
  };
  if (datos.pdfBlob) {
    opcionesEnvio.attachments = [datos.pdfBlob];
  }

  Logger.log("Destinatarios cierre ticket " + datos.nroTicket + ": " + destinatarios.join(", "));
  enviarCorreoSeguro(destinatarios, prefijoAsunto + asuntoBase, cuerpoHtml, opcionesEnvio);
}

// ============================================================================
// 8. UTILIDADES
// ============================================================================
function obtenerCarpetaDestinoDrive() {
  if (CONFIG.DRIVE_FOLDER_ID && String(CONFIG.DRIVE_FOLDER_ID).trim() !== "") {
    try {
      return DriveApp.getFolderById(String(CONFIG.DRIVE_FOLDER_ID).trim());
    } catch (e) {
      Logger.log("Aviso: No se pudo abrir carpeta por DRIVE_FOLDER_ID: " + e.message);
    }
  }
  var folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
}

function normalizarParaComparar(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function obtenerOcrearColumna(sheet, nombreColumna) {
  var lastCol = sheet.getLastColumn();
  if (lastCol <= 0) {
    sheet.getRange(1, 1).setValue(nombreColumna);
    return 1;
  }
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var buscadoNorm = normalizarParaComparar(nombreColumna);

  // 1. Coincidencia exacta (sin distinción de mayúsculas ni acentos)
  for (var i = 0; i < headers.length; i++) {
    var hNorm = normalizarParaComparar(headers[i]);
    if (hNorm === buscadoNorm) {
      return i + 1;
    }
  }

  // 2. Coincidencia parcial si no hubo exacta (solo si tiene longitud suficiente)
  if (buscadoNorm.length >= 4) {
    for (var j = 0; j < headers.length; j++) {
      var h2Norm = normalizarParaComparar(headers[j]);
      if (h2Norm && (h2Norm.indexOf(buscadoNorm) !== -1 || buscadoNorm.indexOf(h2Norm) !== -1)) {
        return j + 1;
      }
    }
  }

  // 3. Crear nueva columna si no existe
  var nuevaCol = lastCol + 1;
  sheet.getRange(1, nuevaCol).setValue(nombreColumna);
  return nuevaCol;
}

function guardarArchivoEnDrive(base64Data, nombreArchivo, nroTicket) {
  try {
    if (!base64Data || typeof base64Data !== "string" || base64Data.trim() === "") return "";
    
    var targetFolder = obtenerCarpetaDestinoDrive();

    var cleanBase64 = base64Data;
    var contentType = "image/jpeg";
    if (base64Data.indexOf("data:") === 0) {
      var partes = base64Data.split(",");
      var mimeMatch = partes[0].match(/:(.*?);/);
      if (mimeMatch) contentType = mimeMatch[1];
      cleanBase64 = partes[1];
    }

    var bytes = Utilities.base64Decode(cleanBase64);
    var extension = contentType.indexOf("png") !== -1 ? ".png" : (contentType.indexOf("webp") !== -1 ? ".webp" : ".jpg");
    var safeName = nroTicket + "_" + (nombreArchivo ? String(nombreArchivo).replace(/\.[^/.]+$/, "") : "evidencia") + extension;
    var blob = Utilities.newBlob(bytes, contentType, safeName);
    var file = targetFolder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {
      Logger.log("Aviso setSharing: " + eShare.message);
    }

    return file.getUrl();
  } catch (err) {
    Logger.log("Error guardando en Drive: " + err.message);
    return "";
  }
}

function obtenerImagenDriveBase64(urlOId) {
  try {
    if (!urlOId) return { success: false, message: "URL o ID vacío" };
    var fileId = "";
    var matchD = String(urlOId).match(/\/d\/([a-zA-Z0-9_-]+)/);
    var matchId = String(urlOId).match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchD) fileId = matchD[1];
    else if (matchId) fileId = matchId[1];
    else fileId = String(urlOId).trim();

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var contentType = blob.getContentType();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return {
      success: true,
      dataUrl: "data:" + contentType + ";base64," + base64,
      viewUrl: file.getUrl()
    };
  } catch (e) {
    Logger.log("Error en obtenerImagenDriveBase64: " + e.message);
    return { success: false, message: e.message };
  }
}

function generarConsecutivoTicket(sheet, prefijo, yearMonth) {
  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var ticketVal = String(data[i][0] || "");
    if (ticketVal.indexOf(prefijo + "-" + yearMonth) === 0) {
      count++;
    }
  }
  var nextNum = count + 1;
  var consecutivo = ("0000" + nextNum).slice(-4);
  return prefijo + "-" + yearMonth + "-" + consecutivo;
}

function buscarFilaPorTicket(sheet, nroTicket) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  var target = String(nroTicket || "").trim().toUpperCase();
  if (!target) return null;

  // Detección dinámica de la columna de ticket a partir de la fila de encabezados
  var colTicket = 0;
  var headers = data[0];
  for (var h = 0; h < headers.length; h++) {
    var hStr = String(headers[h] || "").toLowerCase().trim();
    if (hStr.indexOf("ticket") !== -1 || hStr.indexOf("tickect") !== -1) {
      colTicket = h;
      break;
    }
  }

  for (var i = 1; i < data.length; i++) {
    var val = String(data[i][colTicket] || "").trim().toUpperCase();
    if (val === target) {
      return i + 1;
    }
  }
  return null;
}

function formatFecha(val) {
  if (!val) return "";
  var timezone = (typeof CONFIG !== "undefined" && CONFIG.TIMEZONE) ? CONFIG.TIMEZONE : "America/Bogota";
  if (val instanceof Date) {
    return Utilities.formatDate(val, timezone, "yyyy-MM-dd HH:mm:ss");
  }
  var str = String(val).trim();
  if (str.indexOf("T") !== -1 || str.indexOf("GMT") !== -1 || str.indexOf("UTC") !== -1) {
    try {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, timezone, "yyyy-MM-dd HH:mm:ss");
      }
    } catch(e) {}
  }
  return str;
}

function deducirAreaPorServicio(tipoServicio, nroTicket) {
  if (nroTicket && nroTicket.indexOf("TIC-") === 0) return "TIC";
  if (nroTicket && nroTicket.indexOf("MTO-") === 0) return "Mantenimiento";

  var t = String(tipoServicio || "").toUpperCase();
  if (t === "SAP" || t === "POS" || t === "CORREO" || t === "CONECTIVIDAD" || t.indexOf("TIC") !== -1) {
    return "TIC";
  }
  return "Mantenimiento";
}

function calcularANS(fechaIngreso, fechaCierre) {
  try {
    var dIngreso = (fechaIngreso instanceof Date) ? fechaIngreso : new Date(fechaIngreso);
    var dCierre = (fechaCierre instanceof Date) ? fechaCierre : new Date(fechaCierre);
    var diffMs = dCierre.getTime() - dIngreso.getTime();
    if (isNaN(diffMs) || diffMs < 0) return "En plazo";
    var diffHoras = Math.round(diffMs / (1000 * 60 * 60));
    return diffHoras + " horas";
  } catch (e) {
    return "N/A";
  }
}

function obtenerDetalleTicketPorFila(sheet, fila) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = sheet.getRange(fila, 1, 1, sheet.getLastColumn()).getValues()[0];
  var t = {};
  for (var i = 0; i < headers.length; i++) {
    t[String(headers[i]).trim().toLowerCase()] = row[i];   // normalizar a minúsculas para búsqueda robusta
    t[String(headers[i]).trim()] = row[i];                  // también mantener clave original
  }

  // Helper para buscar por múltiples posibles nombres de columna
  function get() {
    for (var k = 0; k < arguments.length; k++) {
      var v = t[arguments[k]] !== undefined ? t[arguments[k]] : t[String(arguments[k]).toLowerCase()];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return "";
  }

  var equipoEnFunc = String(get("equipo en funcionamiento")).toUpperCase();

  return {
    nroTicket        : get("Nro. Tickect", "Nro. Ticket", "nro. tickect", "nro. ticket"),
    fechaIngreso     : formatFecha(get("fecha de ingreso")),
    tipoTicket       : get("Tipo de ticket", "tipo de ticket"),
    cedulaSolicitante: get("cedula", "Cedula"),
    nombreUsuario    : get("Nombre de Usuario", "nombre de usuario"),
    emailSolicitante : get("Dirección de correo electrónico", "Direccion de correo electronico",
                           "dirección de correo electrónico", "direccion de correo electronico"),
    puntoServicio    : get("Punto de servicio del cual requiere el soporte ",
                           "Punto de servicio del cual requiere el soporte",
                           "punto de servicio del cual requiere el soporte"),
    tipoServicio     : get("Tipo de servicio", "tipo de servicio"),
    descripcionSolicitud: get(
                           "Haga una breve descripción del soporte solicitado ",
                           "Haga una breve descripcion del soporte solicitado",
                           "haga una breve descripción del soporte solicitado",
                           "haga una breve descripcion del soporte solicitado",
                           "descripcion solicitud", "descripcion"),
    placa            : get("Placa", "placa"),
    descripcionEquipo: get("descripcion del equipo", "Descripcion del equipo"),
    estado           : get("Estado del ticket", "estado del ticket"),
    fechaAsignacion  : formatFecha(get("fecha asignacion", "Fecha asignacion")),
    fechaVisita      : get("fecha visita", "Fecha visita"),
    // Técnico
    cedulaResponsable: get("Cedula responsable", "cedula responsable"),
    responsable      : get("Responsable", "responsable"),
    celularResponsable: get("Celular Tecnico", "celular tecnico", "Celular Responsable",
                            "celular responsable", "Celular"),
    fechaCierre      : formatFecha(get("Fecha de Cierre", "fecha de cierre")),
    nivelServicio    : get("Nivel de Servicio", "nivel de servicio"),
    repuesto         : get("Repuesto", "repuesto"),
    respuesta        : get("Respuesta", "respuesta"),
    cedulaQuienRecibe: get("Cedula de quien recibe", "cedula de quien recibe"),
    nombreQuienRecibe: get("Nombre de quien recibe", "nombre de quien recibe"),
    equipoEnFuncionamiento: equipoEnFunc === "SI" || equipoEnFunc === "TRUE",
    razonNoFuncionamiento: get("razon no funcionamiento", "Razon no funcionamiento"),
    observacionesAsignacion: get("observaciones asignacion", "Observaciones asignacion"),
    tecnicaMantenimiento: get("tecnica mantenimiento", "Tecnica mantenimiento"),
    tipoFalla        : get("tipo de falla", "Tipo de falla"),
    celularSolicitante: get("Celular Solicitante", "celular solicitante", "celular_solicitante"),
    fotoSolicitudUrl : get("Foto Solicitud", "foto solicitud", "foto_solicitud", "Evidencia", "foto"),
    fotoCierreUrl    : get("Foto Cierre", "foto cierre", "foto_cierre", "Foto final"),
    costo            : get("Costo", "costo", "valor"),
    aprobacion       : get("Aprobacion", "Aprobación", "aprobacion", "aprobación"),
    obsAdmin         : get("Obs Admin", "obs admin", "observacion admin", "observación admin"),
    consultaAdmin    : get("Consulta Admin", "consulta admin", "consulta"),
    proveedor        : get("Proveedor", "proveedor")
  };
}
