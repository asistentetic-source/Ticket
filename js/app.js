// ============================================================================
// CONEXIÓN API REST - GOOGLE SHEETS DATABASE (Modo GitHub / Desacoplado)
// ============================================================================
const CONFIG_APP = {
  API_URL: "https://script.google.com/macros/s/AKfycbwDycsNdNOWSko40bSHZdXGNLDzekeBlXBgXQo6jTp3wSA9dmTV9gLY8JUk_Lk9Qig/exec"
};

/**
 * Realiza peticiones asíncronas de alta velocidad a la API de Google Apps Script
 * permitiendo que la aplicación funcione en GitHub / GitHub Pages conectada a Google Sheets
 */
async function llamarApiBackend(action, data = {}) {
  try {
    const res = await fetch(CONFIG_APP.API_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({ action: action, ...data })
    });
    return await res.json();
  } catch (err) {
    console.error(`Error en API [${action}]:`, err);
    return { success: false, message: "Error al conectar con la base de datos: " + err.message };
  }
}

/**
 * ============================================================================
 * CLIENT-SIDE LOGIC - MESA DE AYUDA DIALIMENTOS
 * Compatible con Google Apps Script (google.script.run) y ejecución local.
 * ============================================================================
 */

// Estado global de la aplicación
const AppState = {
  currentUser: null,
  currentUserPermisosSet: null,
  catalogos: null,
  tickets: [],
  activeTicket: null,
  filtros: {
    area: "TODAS",
    estado: "TODOS",
    busqueda: ""
  },
  isGAS: typeof google !== 'undefined' && google.script && google.script.run
};

// ============================================================================
// 1. INICIALIZACIÓN
// ============================================================================
document.addEventListener("DOMContentLoaded", function () {
  initApp();
});

function initApp() {
  console.log("Inicializando Mesa de Ayuda. Modo GAS:", AppState.isGAS);
  cargarCatalogos();
}

// Cargar catálogos maestros desde el backend o mock local
function cargarCatalogos() {
  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(function (res) {
        if (!res) {
          mostrarAlerta("Error del servidor al cargar catálogos. Asegúrate de haber republished la Web App en GAS.", "danger");
          console.error("obtenerCatalogos devolvió null");
          return;
        }
        if (res.success) {
          AppState.catalogos = res.data;
          poblarSelectsCatalogos();
          verificarSesion();
        } else {
          mostrarAlerta("Error al cargar catálogos: " + res.message, "danger");
        }
      })
      .withFailureHandler(function (err) {
        console.error("FailureHandler obtenerCatalogos:", err);
        mostrarAlerta("Fallo de conexión con Google Apps Script: " + (err.message || err), "danger");
      })
      .obtenerCatalogos();
  } else {
    // Modo Local con Bridge / Mock Data
    llamarApiBackend("obtenerCatalogos").then(res => {
      if (res && res.success) {
        AppState.catalogos = res.data;
        poblarSelectsCatalogos();
        verificarSesion();
      } else {
        mostrarAlerta("Error al conectar con la base de datos: " + (res ? res.message : "Sin respuesta"), "danger");
      }
    }).catch(err => {
      mostrarAlerta("Error de red con el backend: " + err.message, "danger");
    });
  }
}

// Poblar los selects dinámicamente con los datos del Excel
function poblarSelectsCatalogos() {
  if (!AppState.catalogos) return;

  // 1. Puntos de servicio
  const selPunto = document.getElementById("solicitudPunto");
  const selFiltroPunto = document.getElementById("filtroPunto");
  const puntosOpciones = [];
  if (selPunto) {
    selPunto.innerHTML = '<option value="">Seleccione Punto de Servicio...</option>';
    AppState.catalogos.puntos.forEach(p => {
      const nombre = p.nombre || p["NOMBRE"] || p["PUNTO DE SERVICIO"] || p["PUNTO"] || p["DESCRIPCION"] || "";
      const codigo = p.codigo || p["CODIGO"] || p["CÓDIGO"] || p["COD"] || "";
      const label = codigo ? `${nombre} (${codigo})` : nombre;
      if (nombre && nombre !== "undefined") {
        selPunto.innerHTML += `<option value="${nombre}">${label}</option>`;
        puntosOpciones.push({ nombre, label });
      }
    });
  }
  // Poblar también el filtro de punto en la barra principal
  if (selFiltroPunto) {
    selFiltroPunto.innerHTML = '<option value="TODOS">Todos los Puntos</option>';
    puntosOpciones.forEach(p => {
      selFiltroPunto.innerHTML += `<option value="${p.nombre}">${p.label}</option>`;
    });
  }

  // 2. Tipos de Falla (Modal de cierre - se inicializa limpio y se puebla según el área del ticket)
  const selFalla = document.getElementById("cierreTipoFalla");
  if (selFalla) {
    selFalla.innerHTML = '<option value="">Seleccione tipo de falla...</option>';
  }

  // 3. Tipos de Repuestos (Modal de cierre)
  const selRepuesto = document.getElementById("cierreRepuesto");
  if (selRepuesto) {
    selRepuesto.innerHTML = '<option value="">Seleccione condición del repuesto...</option>';
    AppState.catalogos.tiposRepuesto.forEach(r => {
      selRepuesto.innerHTML += `<option value="${r}">${r}</option>`;
    });
  }

  // 4. Técnicos (Modal de asignación - se inicializa limpio y se puebla dinámicamente según el área del ticket)
  const selTecnico = document.getElementById("asignacionTecnico");
  if (selTecnico) {
    selTecnico.innerHTML = '<option value="">Seleccione Técnico...</option>';
  }
}

// Función auxiliar para normalizar nombres de áreas (TIC vs MANTENIMIENTO)
function normalizarArea(area) {
  if (!area) return "";
  const a = String(area).trim().toUpperCase();
  if (a.includes("TIC") || a.includes("SISTEMA")) return "TIC";
  if (a.includes("MANTEN") || a.includes("MTO")) return "MANTENIMIENTO";
  if (a.includes("RRHH") || a.includes("HUMAN") || a.includes("RECLUTA")) return "RRHH";
  return a;
}

// Clasifica un ítem de tipo de falla como TIC o MANTENIMIENTO según código, área o palabras clave
function clasificarAreaFalla(f) {
  if (f && f.area) {
    const a = normalizarArea(f.area);
    if (a === "TIC" || a === "MANTENIMIENTO") return a;
  }

  // Por código numérico de la hoja TIPO FALLA (1-16: Mantenimiento, 17-34: TIC)
  const cod = parseInt(f.codigo || f.Código || f.CODIGO || f.id || "", 10);
  if (!isNaN(cod)) {
    if (cod >= 1 && cod <= 16) return "MANTENIMIENTO";
    if (cod >= 17) return "TIC";
  }

  // Por palabras clave del nombre
  const nombre = (typeof f === 'string' ? f : (f.nombre || f["Nombre del tipo"] || f["DESCRIPCION CATEGORIA"] || "")).toUpperCase();
  const kwTIC = [
    "HARDWARE", "SOFTWARE", "RED", "CONECTIVIDAD", "INTERNET", "TELEFON", "IMPRESORA", 
    "SISTEMA", "APLICACION", "CORREO", "CUENTA", "ACCESO", "CONTRASE", "SERVIDOR", 
    "ALMACENAMIENTO", "SEGURIDAD", "POS", "PERIFERIC", "CABLEADO", "COMUNICACION"
  ];
  if (kwTIC.some(kw => nombre.includes(kw))) return "TIC";

  return "MANTENIMIENTO";
}

// Determina el área a mostrar en el selector de fallas según el perfil del técnico o ticket
function determinarAreaParaFalla(ticket) {
  // 1. Si el usuario logueado es técnico, manda el área de ese técnico (TIC vs Mantenimiento)
  if (AppState.currentUser) {
    const rol = String(AppState.currentUser.tipoUsuario || "").toLowerCase();
    const areaUser = normalizarArea(AppState.currentUser.area);
    if ((rol.includes("tecnico") || rol.includes("técnico")) && areaUser) {
      return areaUser;
    }
    // Si es un coordinador/admin con área específica
    if (areaUser === "TIC" || areaUser === "MANTENIMIENTO") {
      if (ticket && ticket.area) {
        const areaTicket = normalizarArea(ticket.area);
        if (areaTicket === "TIC" || areaTicket === "MANTENIMIENTO") return areaTicket;
      }
      return areaUser;
    }
  }

  // 2. Si el ticket tiene un técnico responsable asignado, usar el área de ese técnico
  if (ticket && ticket.cedulaResponsable && AppState.catalogos && AppState.catalogos.tecnicos) {
    const tec = AppState.catalogos.tecnicos.find(t => String(t.cedula).trim() === String(ticket.cedulaResponsable).trim());
    if (tec && tec.area) {
      const areaTec = normalizarArea(tec.area);
      if (areaTec === "TIC" || areaTec === "MANTENIMIENTO") return areaTec;
    }
  }

  // 3. Área del ticket
  if (ticket && ticket.area) {
    const a = normalizarArea(ticket.area);
    if (a === "TIC" || a === "MANTENIMIENTO") return a;
  }

  // 4. Prefijo del ticket
  if (ticket && ticket.nroTicket) {
    const nro = String(ticket.nroTicket).toUpperCase();
    if (nro.startsWith("TIC-")) return "TIC";
    if (nro.startsWith("MTO-")) return "MANTENIMIENTO";
  }

  return "MANTENIMIENTO";
}

// Filtra y puebla el desplegable de Tipos de Falla según el área exacta (TIC vs MANTENIMIENTO)
function poblarTiposFallaPorArea(areaTarget) {
  const selFalla = document.getElementById("cierreTipoFalla");
  if (!selFalla) return;

  selFalla.innerHTML = '<option value="">Seleccione tipo de falla...</option>';
  const areaNorm = normalizarArea(areaTarget) || "MANTENIMIENTO";

  let fallas = (AppState.catalogos && AppState.catalogos.tiposFalla) ? AppState.catalogos.tiposFalla : [];

  // Filtrar estrictamente: si es TIC sólo fallas de TIC, si es Mantenimiento sólo Mantenimiento
  let fallasFiltradas = fallas.filter(f => {
    const a = clasificarAreaFalla(f);
    return a === areaNorm;
  });

  const nombresAgregados = new Set();

  fallasFiltradas.forEach(f => {
    let nombre = "";
    if (typeof f === "string") {
      nombre = f;
    } else if (f && typeof f === "object") {
      nombre = f.nombre || f["Nombre del tipo"] || f["DESCRIPCION CATEGORIA"] || f["DESCRIPCIÓN CATEGORIA"] || f.descripcion || "";
    }
    nombre = String(nombre || "").trim();
    // Excluir si es puramente un número (como '1', '2', '3') o vacío
    if (nombre && nombre !== "undefined" && isNaN(Number(nombre)) && !nombresAgregados.has(nombre)) {
      nombresAgregados.add(nombre);
      selFalla.innerHTML += `<option value="${nombre}">${nombre}</option>`;
    }
  });

  // Catálogo completo de respaldo idéntico a la hoja TIPO FALLA de Google Sheets
  if (nombresAgregados.size === 0) {
    const catalogoTIC = [
      "HARDWARE",
      "SOFTWARE",
      "RED / CONECTIVIDAD",
      "INTERNET",
      "TELEFONÍA",
      "IMPRESORAS",
      "SISTEMAS / APLICACIONES",
      "CORREO ELECTRÓNICO",
      "CUENTAS Y ACCESOS",
      "CONTRASEÑAS",
      "SERVIDORES",
      "ALMACENAMIENTO",
      "SEGURIDAD INFORMÁTICA",
      "PUNTOS DE VENTA (POS)",
      "PERIFÉRICOS",
      "CABLEADO / PUNTOS DE RED",
      "EQUIPOS DE COMUNICACIÓN",
      "OTROS"
    ];

    const catalogoMTO = [
      "HIDRÁULICO",
      "ELÉCTRICO",
      "CARPINTERÍA",
      "PLOMERÍA",
      "CERRAJERÍA",
      "PINTURA",
      "OBRA CIVIL",
      "AIRE ACONDICIONADO / CLIMATIZACIÓN",
      "MOBILIARIO",
      "VIDRIERÍA",
      "ILUMINACIÓN",
      "EQUIPOS Y ELECTRODOMÉSTICOS",
      "PISOS Y PAREDES",
      "TECHOS / CUBIERTAS",
      "SEÑALIZACIÓN",
      "OTROS"
    ];

    const lista = areaNorm === "TIC" ? catalogoTIC : catalogoMTO;
    lista.forEach(nombre => {
      selFalla.innerHTML += `<option value="${nombre}">${nombre}</option>`;
    });
  }
}

// Filtrar tipos de servicio según el área seleccionada (Mantenimiento vs TIC)
function onAreaSolicitudChange() {
  const areaSeleccionada = document.getElementById("solicitudArea").value;
  const selServicio = document.getElementById("solicitudTipoServicio");
  if (!selServicio || !AppState.catalogos) return;

  selServicio.innerHTML = '<option value="">Seleccione tipo de servicio...</option>';
  
  const serviciosFiltrados = AppState.catalogos.tiposServicio.filter(s => {
    if (!areaSeleccionada) return true;
    const area = s.area || s.AREA || "";
    return area.includes(areaSeleccionada) || area.includes("Mantenimiento / TIC");
  });

  serviciosFiltrados.forEach(s => {
    const nombre = s.nombre || s.DESCRIPCION || s["DESCRIPCION CATEGORIA"] || s.descripcion;
    selServicio.innerHTML += `<option value="${nombre}">${nombre}</option>`;
  });
}

// ============================================================================
// SISTEMA GRANULAR DE PERMISOS (Columna G: PERMISOS en Google Sheets)
// ============================================================================
/**
 * Resuelve el conjunto de permisos activos para un usuario.
 * Prioridad 1: Palabras clave en la columna G: PERMISOS del archivo Excel.
 * Prioridad 2 (Fallback): Permisos predeterminados según su TIPO USUARIO (Rol).
 */
function obtenerPermisosUsuario(user) {
  if (!user) return new Set();
  const raw = String(user.permisos || "").trim().toUpperCase();
  const tipo = String(user.tipoUsuario || "").toLowerCase();
  const area = normalizarArea(user.area);

  // 1. Si el usuario tiene permisos definidos explícitamente en la columna G:
  if (raw) {
    const lista = raw.split(/[,;|]+/).map(p => p.trim()).filter(Boolean);
    const setPermisos = new Set(lista);

    // Comodín de administración total
    if (setPermisos.has("TODO") || setPermisos.has("ADMIN") || setPermisos.has("ALL") || setPermisos.has("*")) {
      return new Set([
        "CREAR", "ASIGNAR", "CERRAR", "FILTRAR", "BUSCAR", 
        "VER_TODOS", "EDITAR_PLACA", "GESTIONAR_COSTOS", "RRHH", "PUNTOS"
      ]);
    }

    // Compatibilidad de sinónimos habituales
    if (setPermisos.has("BUSCAR")) setPermisos.add("FILTRAR");
    if (setPermisos.has("FILTRAR")) setPermisos.add("BUSCAR");
    if (setPermisos.has("COSTOS") || setPermisos.has("GESTIONAR")) setPermisos.add("GESTIONAR_COSTOS");
    if (setPermisos.has("EMPLEADOS")) setPermisos.add("RRHH");

    // Por defecto todo usuario registrado puede crear solicitudes a menos que se especifique NO_CREAR
    if (!setPermisos.has("NO_CREAR") && !setPermisos.has("SIN_CREAR")) {
      setPermisos.add("CREAR");
    }

    return setPermisos;
  }

  // 2. FALLBACK RETROCOMPATIBLE: Si la columna G está vacía en Google Sheets,
  // inferir los permisos por defecto según el TIPO USUARIO para no bloquear a nadie.
  const fallback = new Set();
  fallback.add("CREAR"); // Todo usuario registrado puede crear solicitudes

  if (tipo === "administradora") {
    fallback.add("GESTIONAR_COSTOS");
    fallback.add("VER_TODOS");
    fallback.add("FILTRAR");
    fallback.add("BUSCAR");
    fallback.add("EDITAR_PLACA");
  } else if (tipo.includes("administrador") || tipo.includes("coordinador")) {
    fallback.add("ASIGNAR");
    fallback.add("CERRAR");
    fallback.add("FILTRAR");
    fallback.add("BUSCAR");
    fallback.add("VER_TODOS");
    fallback.add("EDITAR_PLACA");
    fallback.add("PUNTOS");
    if (area === "RRHH" || area.includes("HUMAN")) fallback.add("RRHH");
  } else if (tipo.includes("tecnico") || tipo.includes("técnico")) {
    fallback.add("CERRAR");
    fallback.add("FILTRAR");
    fallback.add("BUSCAR");
    fallback.add("VER_TODOS");
    fallback.add("EDITAR_PLACA");
  } else if (tipo.includes("reclutador")) {
    fallback.add("RRHH");
  }

  return fallback;
}

/**
 * Consulta si el usuario logueado actualmente posee un permiso específico.
 */
function tienePermiso(permiso) {
  if (!AppState.currentUser) return false;
  if (!AppState.currentUserPermisosSet) {
    AppState.currentUserPermisosSet = obtenerPermisosUsuario(AppState.currentUser);
  }
  const p = String(permiso).trim().toUpperCase();
  return AppState.currentUserPermisosSet.has(p) || 
         AppState.currentUserPermisosSet.has("TODO") || 
         AppState.currentUserPermisosSet.has("ADMIN");
}

window.tienePermiso = tienePermiso;
window.obtenerPermisosUsuario = obtenerPermisosUsuario;

// ============================================================================
// 2. AUTENTICACIÓN Y SESIÓN
// ============================================================================
function verificarSesion() {
  // Limpiar cualquier sesión residual en el navegador para exigir siempre login
  try {
    localStorage.removeItem("DIALIMENTOS_USER");
    sessionStorage.removeItem("DIALIMENTOS_USER");
  } catch (e) {}

  AppState.currentUser = null;
  AppState.currentUserPermisosSet = null;
  AppState.pendingAdminUser = null;

  // Siempre mostrar la pantalla de login al iniciar o recargar
  document.getElementById("loginView").style.display = "flex";
  document.getElementById("mainAppView").style.display = "none";
  volverALoginCedula();
}

function ejecutarLogin(cedulaManual) {
  const cedulaInput = cedulaManual || document.getElementById("cedulaInput").value.trim();
  if (!cedulaInput) {
    mostrarAlerta("Ingrese un número de cédula válido", "warning");
    return;
  }

  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) {
    btnLogin.disabled = true;
    btnLogin.innerHTML = `<span class="spinner-btn"></span> Verificando...`;
  }

  const resetBtnLogin = function() {
    if (btnLogin) {
      btnLogin.disabled = false;
      btnLogin.innerHTML = `Iniciar Sesión`;
    }
  };

  const callback = function (res) {
    if (res.success) {
      resetBtnLogin();
      AppState.currentUser = res.user;
      mostrarAppPrincipal();
    } else if (res.esAdmin || res.requierePassword) {
      resetBtnLogin();
      // Guardar usuario administrativo detectado desde el backend / base de datos
      AppState.pendingAdminUser = res.user || {
        cedula: cedulaInput,
        nombres: "Usuario Administrativo",
        tipoUsuario: "Administrador",
        area: "MANTENIMIENTO"
      };

      // Configurar vista del panel de contraseña con los datos del usuario
      const nameElem = document.getElementById("adminDetectedName");
      const roleElem = document.getElementById("adminDetectedRole");
      const cedulaElem = document.getElementById("adminDetectedCedula");
      const iconElem = document.getElementById("adminDetectedIcon");

      if (nameElem) nameElem.textContent = AppState.pendingAdminUser.nombres || "Usuario";
      if (cedulaElem) cedulaElem.textContent = AppState.pendingAdminUser.cedula || cedulaInput;

      // Asignar icono y texto formateado de rol y área automáticamente
      const area = (AppState.pendingAdminUser.area || "").toUpperCase();
      const tipo = (AppState.pendingAdminUser.tipoUsuario || "").toLowerCase();

      let labelArea = "Coordinación";
      let icono = "💼";

      if (tipo.includes("administradora") || cedulaInput === "1234") {
        labelArea = "Administradora (Mantenimiento)";
        icono = "💼";
      } else if (area.includes("TIC") || area.includes("SISTEMA")) {
        labelArea = "Coordinación de TIC / Sistemas";
        icono = "💻";
      } else if (area.includes("MTO") || area.includes("MANTENIMIENTO")) {
        labelArea = "Coordinación de Mantenimiento";
        icono = "🔧";
      } else if (area.includes("RRHH") || area.includes("RECURSO") || tipo.includes("reclutador")) {
        labelArea = "Recursos Humanos (Reclutador)";
        icono = "👥";
      } else {
        labelArea = AppState.pendingAdminUser.tipoUsuario || "Coordinación";
      }

      if (roleElem) roleElem.textContent = labelArea;
      if (iconElem) iconElem.textContent = icono;

      // Mostrar panel de contraseña
      document.getElementById("panelLoginEmpleado").style.display = "none";
      document.getElementById("panelLoginAdmin").style.display = "block";
      const adminPass = document.getElementById("adminPasswordInput");
      if (adminPass) {
        adminPass.value = "";
        adminPass.focus();
      }
    } else {
      resetBtnLogin();
      mostrarAlerta(res.message || "Cédula no encontrada en el registro de empleados", "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        resetBtnLogin();
        mostrarAlerta("Error de autenticación: " + err, "danger");
      })
      .login(cedulaInput);
  } else {
    llamarApiBackend("login", { cedula: cedulaInput })
      .then(callback)
      .catch(function(err) {
        resetBtnLogin();
        mostrarAlerta("Error de conexión con el servidor", "danger");
      });
  }
}

function volverALoginCedula() {
  AppState.pendingAdminUser = null;
  const panelAdmin = document.getElementById("panelLoginAdmin");
  const panelEmpleado = document.getElementById("panelLoginEmpleado");
  if (panelAdmin) panelAdmin.style.display = "none";
  if (panelEmpleado) panelEmpleado.style.display = "block";
  const passInput = document.getElementById("adminPasswordInput");
  if (passInput) passInput.value = "";
  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) {
    btnLogin.disabled = false;
    btnLogin.innerHTML = `Iniciar Sesión`;
  }
  const btnAdmin = document.getElementById("btnAdminLogin");
  if (btnAdmin) {
    btnAdmin.disabled = false;
    btnAdmin.innerHTML = `Ingresar al Sistema`;
  }
  const cedulaInput = document.getElementById("cedulaInput");
  if (cedulaInput) {
    cedulaInput.focus();
    cedulaInput.select();
  }
}

function cerrarSesion() {
  detenerAutoRefresco();
  localStorage.removeItem("DIALIMENTOS_USER");
  AppState.currentUser = null;
  AppState.currentUserPermisosSet = null;
  AppState.pendingAdminUser = null;
  AppState.filtros.area = "TODAS";
  AppState.filtros.estado = "TODOS";
  AppState.filtros.busqueda = "";
  AppState.filtros.punto = "TODOS";
  delete AppState.filtros.fechaInicio;
  delete AppState.filtros.fechaFin;
  const selArea = document.getElementById("filtroArea");
  if (selArea) {
    selArea.disabled = false;
    selArea.value = "TODAS";
    selArea.style.cursor = "default";
    selArea.style.opacity = "1";
    selArea.removeAttribute("title");
  }
  const elFiltroPuntoReset = document.getElementById("filtroPunto");
  if (elFiltroPuntoReset) { elFiltroPuntoReset.value = "TODOS"; elFiltroPuntoReset.style.display = "none"; }
  const elDateRangeReset = document.getElementById("dateRangeWrapper");
  if (elDateRangeReset) elDateRangeReset.style.display = "none";
  if (typeof toggleDatePicker === 'function') toggleDatePicker(false);
  const elFechaInicioReset = document.getElementById("filtroFechaInicio");
  if (elFechaInicioReset) { elFechaInicioReset.value = ""; }
  const elFechaFinReset = document.getElementById("filtroFechaFin");
  if (elFechaFinReset) { elFechaFinReset.value = ""; }
  volverALoginCedula();
  document.getElementById("loginView").style.display = "flex";
  document.getElementById("mainAppView").style.display = "none";
}

function toggleAdminLogin(mostrarAdmin) {
  if (mostrarAdmin) {
    const cedulaInput = document.getElementById("cedulaInput");
    if (cedulaInput) cedulaInput.focus();
  } else {
    volverALoginCedula();
  }
}

// Exportar explícitamente al ámbito global para evitar problemas de contexto en eventos inline HTML
window.volverALoginCedula = volverALoginCedula;
window.ejecutarLogin = ejecutarLogin;
window.ejecutarLoginAdmin = ejecutarLoginAdmin;
window.cerrarSesion = cerrarSesion;

function ejecutarLoginAdmin() {
  if (!AppState.pendingAdminUser) {
    volverALoginCedula();
    return;
  }

  const password = document.getElementById("adminPasswordInput").value.trim();
  if (!password) {
    mostrarAlerta("Ingrese su contraseña de acceso.", "warning");
    return;
  }

  const btnAdmin = document.getElementById("btnAdminLogin");
  if (btnAdmin) {
    btnAdmin.disabled = true;
    btnAdmin.innerHTML = `<span class="spinner-btn"></span> Ingresando...`;
  }

  const resetBtnAdmin = function() {
    if (btnAdmin) {
      btnAdmin.disabled = false;
      btnAdmin.innerHTML = `Ingresar al Sistema`;
    }
  };

  const cedula = AppState.pendingAdminUser.cedula;
  const area = AppState.pendingAdminUser.area || "";

  const callback = function (res) {
    resetBtnAdmin();
    if (res.success) {
      AppState.currentUser = res.user;
      mostrarAppPrincipal();
    } else {
      mostrarAlerta(res.message || "Contraseña incorrecta.", "danger");
      const passInput = document.getElementById("adminPasswordInput");
      if (passInput) {
        passInput.select();
        passInput.focus();
      }
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        resetBtnAdmin();
        mostrarAlerta("Error de autenticación: " + err, "danger");
      })
      .loginAdmin(cedula, password, area);
  } else {
    llamarApiBackend("loginAdmin", { cedula: cedula, password: password, area: area })
      .then(callback)
      .catch(function(err) {
        resetBtnAdmin();
        mostrarAlerta("Error de conexión con el servidor", "danger");
      });
  }
}

function mostrarAppPrincipal() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("mainAppView").style.display = "block";

  // Inicializar conjunto de permisos del usuario activo
  AppState.currentUserPermisosSet = obtenerPermisosUsuario(AppState.currentUser);

  // Mostrar datos del usuario activo
  document.getElementById("headerUserName").textContent = AppState.currentUser.nombres;
  const roleEl = document.getElementById("headerUserRole");
  if (roleEl) {
    roleEl.textContent = AppState.currentUser.tipoUsuario;
    const arrayPermisos = Array.from(AppState.currentUserPermisosSet || []);
    roleEl.title = "Permisos activos: " + (arrayPermisos.join(", ") || "Por defecto de su rol");
  }
  document.getElementById("headerUserInitial").textContent = AppState.currentUser.nombres.charAt(0);

  // Ajustar permisos visuales según rol y área
  const esAdministradora = AppState.currentUser.tipoUsuario.toLowerCase() === "administradora";
  const areaUser = normalizarArea(AppState.currentUser.area);
  const puedeVerTodos = tienePermiso("VER_TODOS");

  // Configurar filtro de área
  const selArea = document.getElementById("filtroArea");
  if (esAdministradora) {
    // Administradora ve solo Mantenimiento pero puede filtrar estados
    AppState.filtros.area = "Mantenimiento";
    if (selArea) {
      selArea.value = "Mantenimiento";
      selArea.disabled = true;
      selArea.style.cursor = "not-allowed";
      selArea.style.opacity = "0.85";
      selArea.title = "Fijado a área de Mantenimiento";
    }
  } else if (puedeVerTodos && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
    const valorArea = areaUser === "TIC" ? "TIC" : "Mantenimiento";
    AppState.filtros.area = valorArea;
    if (selArea) {
      selArea.value = valorArea;
      selArea.disabled = true;
      selArea.style.cursor = "not-allowed";
      selArea.style.opacity = "0.85";
      selArea.title = "Fijado a su área (" + valorArea + ")";
    }
  } else {
    if (selArea) {
      selArea.disabled = false;
      selArea.style.cursor = "default";
      selArea.style.opacity = "1";
      selArea.removeAttribute("title");
    }
  }

  // Mostrar panel de acciones RRHH solo si tiene permiso RRHH
  const rrhhContainer = document.getElementById("rrhhActionsContainer");
  if (rrhhContainer) {
    rrhhContainer.style.display = tienePermiso("RRHH") ? "flex" : "none";
  }

  // Mostrar botón Añadir Punto si tiene permiso PUNTOS o ASIGNAR
  const btnNuevoPunto = document.getElementById("btnNuevoPuntoHeader");
  if (btnNuevoPunto) {
    btnNuevoPunto.style.display = (tienePermiso("PUNTOS") || tienePermiso("ASIGNAR")) ? "" : "none";
  }

  // Mostrar filtros de Punto y Rango de Fechas según permiso de filtrado / búsqueda
  const mostrarFiltrosExtra = tienePermiso("FILTRAR") || tienePermiso("BUSCAR");
  const elFiltroPunto = document.getElementById("filtroPunto");
  const elDateRangeWrapper = document.getElementById("dateRangeWrapper");
  if (elFiltroPunto) elFiltroPunto.style.display = mostrarFiltrosExtra ? "" : "none";
  if (elDateRangeWrapper) elDateRangeWrapper.style.display = mostrarFiltrosExtra ? "inline-block" : "none";

  // Mostrar botón de creación de tickets según permiso CREAR
  const puedeCrear = tienePermiso("CREAR");
  const btnNuevoHdr = document.getElementById("btnCrearTicketPrincipal");
  if (btnNuevoHdr) btnNuevoHdr.style.display = puedeCrear ? "" : "none";

  // Inicializar rango de fechas: del día 1 del mes actual al día de hoy
  if (mostrarFiltrosExtra) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const fechaHoy = `${yyyy}-${mm}-${dd}`;
    const fechaInicio = `${yyyy}-${mm}-01`;
    AppState.filtros.fechaInicio = fechaInicio;
    AppState.filtros.fechaFin = fechaHoy;
    AppState.filtros.punto = "TODOS";
    if (typeof initDatePicker === 'function') {
      initDatePicker(fechaInicio, fechaHoy);
    }
  } else {
    delete AppState.filtros.fechaInicio;
    delete AppState.filtros.fechaFin;
  }

  cargarTickets();
  iniciarAutoRefresco();
}

// ============================================================================
// 3. AUTO-REFRESCO Y GESTIÓN DE TICKETS
// ============================================================================
let timerAutoRefresco = null;

function iniciarAutoRefresco() {
  detenerAutoRefresco();
  if (!AppState.currentUser) return;

  const rol = String(AppState.currentUser.tipoUsuario || "").toLowerCase();
  const esCoordinadorOTecnico = rol.includes("administrador") || 
                                rol.includes("tecnico") || 
                                rol.includes("técnico") || 
                                rol.includes("administradora") ||
                                rol.includes("reclutador") ||
                                rol.includes("coordinador");

  if (esCoordinadorOTecnico) {
    console.log("⏱️ Auto-refresco programado cada 5 minutos para", AppState.currentUser.tipoUsuario);
    // Intervalo de 5 minutos = 300,000 ms
    timerAutoRefresco = setInterval(function() {
      if (AppState.currentUser) {
        console.log("🔄 Ejecutando auto-refresco cada 5 minutos...");
        cargarTickets(true);
      }
    }, 5 * 60 * 1000);
  }
}

function detenerAutoRefresco() {
  if (timerAutoRefresco) {
    clearInterval(timerAutoRefresco);
    timerAutoRefresco = null;
  }
}

function recargarTicketsManual() {
  const btns = [
    document.getElementById("btnRecargarHeader"),
    document.getElementById("btnRecargarTabla")
  ].filter(Boolean);

  btns.forEach(b => {
    b.disabled = true;
    b.innerHTML = `<span class="spinner-btn" style="width: 0.85rem; height: 0.85rem; border-width: 2px;"></span> Actualizando...`;
  });

  cargarTickets(false, function(res) {
    btns.forEach(b => {
      b.disabled = false;
      b.innerHTML = `🔄 Actualizar`;
    });
    if (res && res.success) {
      mostrarAlerta("Lista de tickets actualizada con éxito.", "success");
    }
  });
}

window.recargarTicketsManual = recargarTicketsManual;

function cargarTickets(esSilencioso = false, onComplete = null) {
  if (!AppState.currentUser) return;
  const filtros = { ...AppState.filtros };

  const rol = String(AppState.currentUser.tipoUsuario || "").toLowerCase();
  const esAdministradora = rol === "administradora";
  const puedeVerTodos = tienePermiso("VER_TODOS");
  const areaUser = normalizarArea(AppState.currentUser.area);

  // Administradora: ve TODOS los tickets de Mantenimiento
  if (esAdministradora) {
    filtros.area = "Mantenimiento";
    delete filtros.cedulaSolicitante;
    delete filtros.cedulaResponsable;
    filtros.userRole = AppState.currentUser.tipoUsuario;
    filtros.userArea = AppState.currentUser.area;
  } else if (!puedeVerTodos) {
    // Si no tiene permiso de ver todos, solo ve sus tickets propios
    filtros.cedulaSolicitante = AppState.currentUser.cedula;
    filtros.userRole = AppState.currentUser.tipoUsuario;
    filtros.userArea = AppState.currentUser.area;
  } else {
    // Si tiene permiso de ver todos, filtrar por su área si pertenece a TIC o Mantenimiento
    if (areaUser === "TIC" || areaUser === "MANTENIMIENTO") {
      filtros.area = areaUser === "TIC" ? "TIC" : "Mantenimiento";
    }
    delete filtros.cedulaSolicitante;
    filtros.userArea = normalizarArea(AppState.currentUser.area);
    filtros.userRole = AppState.currentUser.tipoUsuario;
    filtros.userCedula = AppState.currentUser.cedula;
  }

  const callback = function (res) {
    if (onComplete && typeof onComplete === "function") {
      onComplete(res);
    }
    // Protección: GAS puede retornar null si el servidor lanza una excepción no capturada
    if (!res) {
      if (!esSilencioso) {
        mostrarAlerta("Error del servidor al cargar tickets. Revisa los permisos o el script en GAS.", "danger");
      }
      console.error("obtenerTickets devolvió null — posible error interno en el servidor GAS.");
      return;
    }
    if (res.success) {
      const aUser = normalizarArea(AppState.currentUser.area);

      if (esAdministradora) {
        // Administradora: todos los tickets de Mantenimiento
        AppState.tickets = (res.tickets || []).filter(t => normalizarArea(t.area) === "MANTENIMIENTO");
      } else if (!puedeVerTodos) {
        AppState.tickets = (res.tickets || []).filter(t => String(t.cedulaSolicitante).trim() === String(AppState.currentUser.cedula).trim());
      } else if (aUser === "TIC" || aUser === "MANTENIMIENTO") {
        AppState.tickets = (res.tickets || []).filter(t => normalizarArea(t.area) === aUser);
      } else {
        AppState.tickets = res.tickets || [];
      }

      renderizarKPIs();
      renderizarTablaTickets();
    } else {
      if (!esSilencioso) {
        mostrarAlerta("Error cargando tickets: " + res.message, "danger");
      }
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        if (onComplete && typeof onComplete === "function") onComplete({ success: false, error: err });
        console.error("FailureHandler obtenerTickets:", err);
        if (!esSilencioso) {
          mostrarAlerta("Fallo al obtener tickets: " + (err.message || err), "danger");
        }
      })
      .obtenerTickets(filtros);
  } else {
    llamarApiBackend("obtenerTickets", { filtros: filtros })
      .then(callback)
      .catch(function(err) {
        if (onComplete && typeof onComplete === "function") onComplete({ success: false, error: err });
        if (!esSilencioso) {
          mostrarAlerta("Error de conexión al cargar tickets", "danger");
        }
      });
  }
}

function renderizarKPIs() {
  const tickets = AppState.tickets;
  const total = tickets.length;
  const abiertos = tickets.filter(t => t.estado.toUpperCase() === "ABIERTO").length;
  const proceso = tickets.filter(t => t.estado.toUpperCase() === "PROCESO").length;
  const pendientes = tickets.filter(t => t.estado.toUpperCase() === "PENDIENTE").length;
  const cerrados = tickets.filter(t => t.estado.toUpperCase() === "CERRADO").length;

  document.getElementById("kpiTotal").textContent = total;
  document.getElementById("kpiAbiertos").textContent = abiertos;
  document.getElementById("kpiProceso").textContent = proceso;
  document.getElementById("kpiPendientes").textContent = pendientes;
  document.getElementById("kpiCerrados").textContent = cerrados;
}

function renderizarTablaTickets() {
  const tbody = document.getElementById("ticketsTableBody");
  if (!tbody) return;

  const esAdministradora = AppState.currentUser.tipoUsuario.toLowerCase() === "administradora";
  const areaUser = normalizarArea(AppState.currentUser.area);
  const puedeVerTodos = tienePermiso("VER_TODOS");

  const filtroPuntoVal = (AppState.filtros.punto || "TODOS");
  const filtroFecIni = AppState.filtros.fechaInicio || "";
  const filtroFecFin = AppState.filtros.fechaFin || "";
  const filtroBusq = (AppState.filtros.busqueda || "").toLowerCase();

  const ticketsAMostrar = AppState.tickets.filter(t => {
    // Filtro de área por rol / alcance
    if (esAdministradora) {
      if (normalizarArea(t.area) !== "MANTENIMIENTO") return false;
    } else if (puedeVerTodos && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
      if (normalizarArea(t.area) !== areaUser) return false;
    }
    // Filtro por estado
    const estadoFiltro = AppState.filtros.estado || "TODOS";
    if (estadoFiltro !== "TODOS" && (t.estado || "").toUpperCase() !== estadoFiltro) return false;
    // Filtro por área selector
    const areaFiltro = AppState.filtros.area || "TODAS";
    if (areaFiltro !== "TODAS" && t.area !== areaFiltro) return false;
    // Filtro por punto de servicio
    if (filtroPuntoVal !== "TODOS" && (t.puntoServicio || "") !== filtroPuntoVal) return false;
    // Filtro por rango de fechas
    if (filtroFecIni || filtroFecFin) {
      const fechaTkt = (t.fechaIngreso || "").substring(0, 10);
      if (filtroFecIni && fechaTkt < filtroFecIni) return false;
      if (filtroFecFin && fechaTkt > filtroFecFin) return false;
    }
    // Filtro de búsqueda por texto
    if (filtroBusq) {
      const haystack = [
        t.nroTicket, t.placa, t.descripcionEquipo, t.puntoServicio, t.descripcionSolicitud
      ].join(" ").toLowerCase();
      if (!haystack.includes(filtroBusq)) return false;
    }
    return true;
  });

  if (ticketsAMostrar.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No se encontraron tickets registrados con los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = ticketsAMostrar.map(t => {
    const estadoClass = "badge-" + t.estado.toLowerCase();
    const areaClass = t.area === "TIC" ? "badge-area-tic" : "badge-area-mto";
    const areaTicketNorm = normalizarArea(t.area);
    const esMismaArea = !areaUser || areaUser === areaTicketNorm;
    
    // Botones de acción contextuales según permisos y estado
    let botonesAccion = `<button class="btn btn-secondary btn-sm" onclick="verDetalleTicket('${t.nroTicket}')">Ver</button>`;

    // Botón con ojo para ver y descargar el Acta Técnica (disponible para todo usuario en tickets cerrados)
    const esCerrado = String(t.estado || "").toUpperCase() === "CERRADO" || !!t.fechaCierre;
    if (esCerrado) {
      botonesAccion += ` <button class="btn btn-acta btn-sm" onclick="verActaTicket('${t.nroTicket}')" title="Ver Acta Oficial de Entrega Técnica en PDF">👁️ Acta</button>`;
    }

    if (tienePermiso("ASIGNAR") && esMismaArea && t.estado.toUpperCase() === "ABIERTO") {
      botonesAccion += ` <button class="btn btn-primary btn-sm" onclick="abrirModalAsignar('${t.nroTicket}')">Asignar</button>`;
    }

    if (tienePermiso("CERRAR") && esMismaArea && (t.estado.toUpperCase() === "PROCESO" || t.estado.toUpperCase() === "PENDIENTE")) {
      const esPend = t.estado.toUpperCase() === "PENDIENTE";
      const txtBtn = esPend ? "Reanudar / Gestionar" : "Cerrar";
      const clsBtn = esPend ? "btn-warning" : "btn-success";
      botonesAccion += ` <button class="btn ${clsBtn} btn-sm" onclick="abrirModalCierre('${t.nroTicket}')">${txtBtn}</button>`;
    }

    // Botón para Administradora o usuarios con permiso GESTIONAR_COSTOS
    if (tienePermiso("GESTIONAR_COSTOS") || esAdministradora) {
      botonesAccion += ` <button class="btn btn-sm" style="background: rgba(217, 119, 6, 0.12); border: 1px solid rgba(217, 119, 6, 0.35); color: #b45309; font-weight: 600;" onclick="abrirModalAdministradora('${t.nroTicket}')">💼 Gestionar</button>`;
    }

    return `
      <tr class="ticket-row">
        <td class="col-ticket">
          <span class="ticket-code">${t.nroTicket}</span>
          <small class="ticket-time" style="color: var(--text-dim); font-size: 0.78rem;">${formatearFechaHoraCO(t.fechaIngreso)}</small>
        </td>
        <td class="col-area"><span class="badge-tag ${areaClass}">${t.area}</span></td>
        <td class="col-servicio"><strong>${t.tipoServicio}</strong><br><small style="color: var(--text-dim);">📍 ${t.puntoServicio}</small></td>
        <td class="col-equipo">
          <div style="font-weight: 600;">⚙️ ${t.descripcionEquipo || 'Sin equipo'}</div>
          ${tienePermiso("EDITAR_PLACA")
            ? `<span class="badge-plate" style="font-size: 0.72rem; cursor: pointer;" title="Clic para modificar placa" onclick="abrirModalEditarPlaca('${t.nroTicket}', '${t.placa}')">${t.placa || 'Sin Placa'} ✏️</span>`
            : `<span class="badge-plate" style="font-size: 0.72rem;" title="Placa del equipo">${t.placa || 'Sin Placa'}</span>`}
        </td>
        <td class="col-desc" style="max-width: 220px; white-space: normal; line-height: 1.35;">
          ${t.descripcionSolicitud}
          ${t.fotoSolicitudUrl ? `<br><span class="badge-evidence" onclick="verFotoTicket('${t.nroTicket}', '${t.fotoSolicitudUrl}', 'Solicitud')" title="Ver evidencia fotográfica adjunta">📷 Evidencia</span>` : ''}
          ${t.fotoCierreUrl ? ` <span class="badge-evidence badge-evidence-cierre" onclick="verFotoTicket('${t.nroTicket}', '${t.fotoCierreUrl}', 'Cierre')" title="Ver foto del trabajo finalizado">📸 Foto Cierre</span>` : ''}
        </td>
        <td class="col-resp">
          <span class="resp-label" style="display: none;">👤 Responsable: </span>
          ${t.responsable ? `<span>👤 ${t.responsable}</span>` : '<span style="color: var(--text-dim);">👤 Sin Asignar</span>'}
          ${(esAdministradora || tienePermiso("GESTIONAR_COSTOS")) && t.proveedor ? `<br><small style="color: var(--text-muted); font-size: 0.74rem;">🏭 ${t.proveedor}</small>` : ''}
        </td>
        <td class="col-estado">
          <span class="badge-tag ${estadoClass}">${t.estado}</span>
          ${(esAdministradora || tienePermiso("GESTIONAR_COSTOS")) && t.aprobacion ? `<br><span style="display: inline-block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; font-weight: 500;">📋 ${t.aprobacion}</span>` : ''}
          ${(esAdministradora || tienePermiso("GESTIONAR_COSTOS")) && t.costo ? `<br><span style="display: inline-block; margin-top: 2px; font-size: 0.72rem; padding: 1px 5px; border-radius: 4px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; font-weight: 600;">💰 ${t.costo}</span>` : ''}
        </td>
        <td class="col-acciones">
          <div class="actions-container">
            ${botonesAccion}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Filtros de búsqueda
function onFiltroChange() {
  const rol = String(AppState.currentUser && AppState.currentUser.tipoUsuario || "").toLowerCase();
  const esAdministradora = rol === "administradora";
  const puedeVerTodos = tienePermiso("VER_TODOS");
  const areaUser = normalizarArea(AppState.currentUser && AppState.currentUser.area);

  if (esAdministradora) {
    AppState.filtros.area = "Mantenimiento";
  } else if (puedeVerTodos && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
    AppState.filtros.area = areaUser === "TIC" ? "TIC" : "Mantenimiento";
  } else {
    AppState.filtros.area = document.getElementById("filtroArea").value;
  }
  AppState.filtros.estado = document.getElementById("filtroEstado").value;
  AppState.filtros.busqueda = document.getElementById("buscarInput").value;

  // Filtros extra: Punto y Rango de Fechas (solo visibles para admins/técnicos)
  const elPunto = document.getElementById("filtroPunto");
  const elFecIni = document.getElementById("filtroFechaInicio");
  const elFecFin = document.getElementById("filtroFechaFin");
  if (elPunto) AppState.filtros.punto = elPunto.value || "TODOS";
  if (elFecIni) AppState.filtros.fechaInicio = elFecIni.value || "";
  if (elFecFin) AppState.filtros.fechaFin = elFecFin.value || "";

  cargarTickets();
}

// ============================================================================
// DATE RANGE PICKER PERSONALIZADO CON UN SOLO CALENDARIO (Ayer, Hoy, etc.)
// ============================================================================
const DatePickerState = {
  fechaInicio: "",
  fechaFin: "",
  mesActual: new Date(),
  seleccionandoFin: false,
  isOpen: false
};

const NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function formatearFechaVisual(fechaStr) {
  if (!fechaStr) return "—";
  const partes = fechaStr.split("-");
  if (partes.length !== 3) return fechaStr;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatearYMD(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function initDatePicker(inicioStr, finStr) {
  const hoy = new Date();
  if (!inicioStr) {
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    inicioStr = `${yyyy}-${mm}-01`;
  }
  if (!finStr) {
    finStr = formatearYMD(hoy);
  }

  DatePickerState.fechaInicio = inicioStr;
  DatePickerState.fechaFin = finStr;
  DatePickerState.seleccionandoFin = false;

  const [y, m] = (finStr || inicioStr).split("-").map(Number);
  DatePickerState.mesActual = new Date(y, m - 1, 1);

  const inpIni = document.getElementById("filtroFechaInicio");
  const inpFin = document.getElementById("filtroFechaFin");
  if (inpIni) inpIni.value = inicioStr;
  if (inpFin) inpFin.value = finStr;

  actualizarDisplaysYBotones();
  renderCalendario();
}

function toggleDatePicker(forceState) {
  const panel = document.getElementById("datePickerPanel");
  const btn = document.getElementById("dateRangeBtn");
  if (!panel || !btn) return;

  const newState = (typeof forceState === "boolean") ? forceState : !DatePickerState.isOpen;
  DatePickerState.isOpen = newState;

  if (newState) {
    panel.style.display = "block";
    btn.classList.add("open");
    renderCalendario();
  } else {
    panel.style.display = "none";
    btn.classList.remove("open");
  }
}

function actualizarDisplaysYBotones() {
  const lbl = document.getElementById("dateRangeLabel");
  const dIni = document.getElementById("displayFechaInicio");
  const dFin = document.getElementById("displayFechaFin");
  const btn = document.getElementById("dateRangeBtn");

  const vIni = formatearFechaVisual(DatePickerState.fechaInicio);
  const vFin = formatearFechaVisual(DatePickerState.fechaFin);

  if (lbl) lbl.textContent = `${vIni} – ${vFin}`;
  if (dIni) dIni.textContent = vIni;
  if (dFin) dFin.textContent = vFin;
  if (btn) {
    if (DatePickerState.fechaInicio || DatePickerState.fechaFin) {
      btn.classList.add("active-range");
    } else {
      btn.classList.remove("active-range");
    }
  }
}

function navCal(delta) {
  DatePickerState.mesActual.setMonth(DatePickerState.mesActual.getMonth() + delta);
  renderCalendario();
}

function renderCalendario() {
  const grid = document.getElementById("calGrid");
  const title = document.getElementById("calTitle");
  if (!grid || !title) return;

  const dateCursor = DatePickerState.mesActual;
  const yyyy = dateCursor.getFullYear();
  const mm = dateCursor.getMonth();
  title.textContent = `${NOMBRES_MESES[mm]} ${yyyy}`;

  // Encabezados de días: D, L, M, M, J, V, S
  const diasSemana = ["D", "L", "M", "M", "J", "V", "S"];
  let html = diasSemana.map(d => `<div class="cal-day-name">${d}</div>`).join("");

  const primerDiaSemana = new Date(yyyy, mm, 1).getDay(); // 0 = Domingo
  const diasEnMes = new Date(yyyy, mm + 1, 0).getDate();

  // Días vacíos previos
  for (let i = 0; i < primerDiaSemana; i++) {
    html += `<div class="cal-day cal-day-empty"></div>`;
  }

  const hoyYMD = formatearYMD(new Date());

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const diaStr = String(dia).padStart(2, "0");
    const mesStr = String(mm + 1).padStart(2, "0");
    const ymd = `${yyyy}-${mesStr}-${diaStr}`;

    const isToday = ymd === hoyYMD;
    const isStart = ymd === DatePickerState.fechaInicio;
    const isEnd = ymd === DatePickerState.fechaFin;
    const inRange = DatePickerState.fechaInicio && DatePickerState.fechaFin &&
                    ymd > DatePickerState.fechaInicio && ymd < DatePickerState.fechaFin;

    let clases = ["cal-day"];
    if (isToday) clases.push("cal-day-today");
    if (isStart) clases.push("cal-day-selected", "cal-day-range-start");
    if (isEnd) clases.push("cal-day-selected", "cal-day-range-end");
    if (inRange) clases.push("cal-day-in-range");

    html += `<div class="${clases.join(" ")}" onclick="seleccionarDia('${ymd}')">${dia}</div>`;
  }

  grid.innerHTML = html;
}

function seleccionarDia(ymd) {
  if (!DatePickerState.seleccionandoFin) {
    // Primer clic: define fecha de inicio
    DatePickerState.fechaInicio = ymd;
    DatePickerState.fechaFin = ymd;
    DatePickerState.seleccionandoFin = true;
  } else {
    // Segundo clic: define fecha de fin
    if (ymd < DatePickerState.fechaInicio) {
      DatePickerState.fechaFin = DatePickerState.fechaInicio;
      DatePickerState.fechaInicio = ymd;
    } else {
      DatePickerState.fechaFin = ymd;
    }
    DatePickerState.seleccionandoFin = false;
  }

  // Quitar estilo activo de botones rápidos al seleccionar manualmente
  document.querySelectorAll(".date-quick-btn").forEach(b => b.classList.remove("active"));

  actualizarDisplaysYBotones();
  renderCalendario();
}

function aplicarRapido(preset) {
  const hoy = new Date();
  let fIni = "";
  let fFin = "";

  if (preset === "hoy") {
    fIni = formatearYMD(hoy);
    fFin = fIni;
  } else if (preset === "ayer") {
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    fIni = formatearYMD(ayer);
    fFin = fIni;
  } else if (preset === "semana") {
    const hace7 = new Date();
    hace7.setDate(hoy.getDate() - 6);
    fIni = formatearYMD(hace7);
    fFin = formatearYMD(hoy);
  } else if (preset === "mes") {
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    fIni = `${yyyy}-${mm}-01`;
    fFin = formatearYMD(hoy);
  }

  // Marcar botón activo
  document.querySelectorAll(".date-quick-btn").forEach(b => {
    b.classList.remove("active");
    if (b.getAttribute("onclick") && b.getAttribute("onclick").includes(`'${preset}'`)) {
      b.classList.add("active");
    }
  });

  DatePickerState.fechaInicio = fIni;
  DatePickerState.fechaFin = fFin;
  DatePickerState.seleccionandoFin = false;

  const [y, m] = fFin.split("-").map(Number);
  DatePickerState.mesActual = new Date(y, m - 1, 1);

  actualizarDisplaysYBotones();
  renderCalendario();

  aplicarFiltroFecha();
}

function aplicarFiltroFecha() {
  const inpIni = document.getElementById("filtroFechaInicio");
  const inpFin = document.getElementById("filtroFechaFin");
  if (inpIni) inpIni.value = DatePickerState.fechaInicio;
  if (inpFin) inpFin.value = DatePickerState.fechaFin;

  AppState.filtros.fechaInicio = DatePickerState.fechaInicio;
  AppState.filtros.fechaFin = DatePickerState.fechaFin;

  actualizarDisplaysYBotones();
  toggleDatePicker(false);
  cargarTickets();
}

// Cerrar panel al hacer clic fuera del date range picker
document.addEventListener("click", function (e) {
  const wrapper = document.getElementById("dateRangeWrapper");
  if (!wrapper) return;
  if (DatePickerState.isOpen && !wrapper.contains(e.target)) {
    toggleDatePicker(false);
  }
});

// Exportar al ámbito global
window.toggleDatePicker = toggleDatePicker;
window.aplicarRapido = aplicarRapido;
window.navCal = navCal;
window.seleccionarDia = seleccionarDia;
window.aplicarFiltroFecha = aplicarFiltroFecha;

// ============================================================================
// 4. CREAR TICKET (SOLICITUD)
// ============================================================================
function abrirModalNuevoTicket() {
  document.getElementById("formNuevoTicket").reset();
  removerFoto('solicitud');
  document.getElementById("solicitudNombre").value = AppState.currentUser.nombres;
  document.getElementById("solicitudCedula").value = AppState.currentUser.cedula;
  document.getElementById("solicitudEmail").value = AppState.currentUser.email;
  // Halar automáticamente el celular del empleado logueado
  const elSolCel = document.getElementById("solicitudCelular");
  if (elSolCel) {
    elSolCel.value = AppState.currentUser.celular || "";
  }
  onAreaSolicitudChange();
  
  // Iniciar reloj en vivo en hora oficial de Colombia
  actualizarRelojModal();
  if (window.relojModalInterval) clearInterval(window.relojModalInterval);
  window.relojModalInterval = setInterval(actualizarRelojModal, 1000);

  abrirModal("modalNuevoTicket");
}

function guardarNuevoTicket(e) {
  e.preventDefault();

  const elSolCel = document.getElementById("solicitudCelular");
  const celularVal = elSolCel ? elSolCel.value.trim() : (AppState.currentUser.celular || "");

  const ticketData = {
    area: document.getElementById("solicitudArea").value,
    tipoTicket: document.getElementById("solicitudTipoTicket").value,
    tipoServicio: document.getElementById("solicitudTipoServicio").value,
    puntoServicio: document.getElementById("solicitudPunto").value,
    cedulaSolicitante: AppState.currentUser.cedula,
    nombreUsuario: AppState.currentUser.nombres,
    emailSolicitante: AppState.currentUser.email,
    celularSolicitante: celularVal,
    descripcionEquipo: document.getElementById("solicitudEquipo").value.trim(),
    placa: document.getElementById("solicitudPlaca").value.trim(),
    descripcionSolicitud: document.getElementById("solicitudDescripcion").value.trim(),
    imagenBase64: window.tempImagenSolicitudBase64 || ""
  };

  if (!ticketData.area || !ticketData.tipoServicio || !ticketData.puntoServicio || !ticketData.descripcionSolicitud) {
    mostrarAlerta("Complete todos los campos obligatorios (*)", "warning");
    return;
  }

  const btn = document.getElementById("btnGuardarTicket");
  btn.disabled = true;
  btn.textContent = "Registrando solicitud...";

  const callback = function (res) {
    btn.disabled = false;
    btn.textContent = "Enviar Solicitud";
    if (!res) {
      mostrarAlerta("No se recibió respuesta del servidor al crear el ticket.", "danger");
      return;
    }
    if (res.success) {
      cerrarModal("modalNuevoTicket");
      mostrarAlerta(res.message, "success");
      cargarTickets();
    } else {
      mostrarAlerta("Error: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Enviar Solicitud";
        mostrarAlerta("Error al conectar: " + err, "danger");
      })
      .crearTicket(ticketData);
  } else {
    llamarApiBackend("crearTicket", { ticketData: ticketData }).then(callback);
  }
}

// ============================================================================
// 5. ASIGNACIÓN DE TICKET (COORDINADOR)
// ============================================================================
function abrirModalAsignar(nroTicket) {
  const ticket = AppState.tickets.find(t => t.nroTicket === nroTicket);
  if (!ticket) return;

  AppState.activeTicket = ticket;
  document.getElementById("asigNroTicket").textContent = ticket.nroTicket;
  document.getElementById("asigPunto").textContent = ticket.puntoServicio;
  document.getElementById("asigEquipo").textContent = ticket.descripcionEquipo + " (Placa: " + ticket.placa + ")";
  document.getElementById("asigDescripcion").textContent = ticket.descripcionSolicitud;

  // Mostrar celular del solicitante
  const elCelular = document.getElementById("asigCelularSolicitante");
  const rowCelular = document.getElementById("asigCelularRow");
  if (elCelular && rowCelular) {
    if (ticket.celularSolicitante) {
      elCelular.textContent = ticket.celularSolicitante;
      rowCelular.style.display = "";
    } else {
      rowCelular.style.display = "none";
    }
  }
  
  // Mostrar foto de la solicitud si existe
  const contFoto = document.getElementById("asigFotoContainer");
  const elFoto = document.getElementById("asigFotoContent");
  if (contFoto && elFoto) {
    if (ticket.fotoSolicitudUrl) {
      contFoto.style.display = "block";
      elFoto.innerHTML = renderizarComponenteFoto(ticket.fotoSolicitudUrl, `Evidencia Solicitud - ${ticket.nroTicket}`);
    } else {
      contFoto.style.display = "none";
      elFoto.innerHTML = "";
    }
  }

  // Repoblar técnicos filtrados estrictamente por el área del ticket
  // No debe aparecer ningún técnico ni administrador de la otra área
  const selTecnico = document.getElementById("asignacionTecnico");
  if (selTecnico && AppState.catalogos && AppState.catalogos.tecnicos) {
    const areaTicketNorm = normalizarArea(ticket.area);
    selTecnico.innerHTML = '<option value="">Seleccione Técnico...</option>';
    AppState.catalogos.tecnicos
      .filter(t => {
        const areaTecNorm = normalizarArea(t.area);
        // Debe pertenecer estrictamente a la misma área del ticket (TIC con TIC, Mantenimiento con Mantenimiento)
        return areaTecNorm === areaTicketNorm;
      })
      .forEach(t => {
        selTecnico.innerHTML += `<option value="${t.cedula}" data-nombre="${t.nombres}" data-celular="${t.celular || ''}" data-email="${t.email || ''}">${t.nombres} (${t.tipoUsuario})</option>`;
      });
  }

  // Limpiar campos
  document.getElementById("asignacionTecnico").value = "";
  document.getElementById("asignacionFechaVisita").value = "";
  document.getElementById("asignacionObservaciones").value = "";
  document.getElementById("asignacionTecnica").value = "";

  abrirModal("modalAsignarTicket");
}

function guardarAsignacionTicket(e) {
  e.preventDefault();
  const selTecnico = document.getElementById("asignacionTecnico");
  const selectedOpt = selTecnico.options[selTecnico.selectedIndex];

  if (!selTecnico.value) {
    mostrarAlerta("Debe seleccionar un técnico.", "warning");
    return;
  }

  const asignacionData = {
    nroTicket: AppState.activeTicket.nroTicket,
    celularSolicitante: AppState.activeTicket.celularSolicitante || "",
    emailSolicitante: AppState.activeTicket.emailSolicitante || "",
    cedulaSolicitante: AppState.activeTicket.cedulaSolicitante || "",
    cedulaTecnico: selTecnico.value,
    nombreTecnico: selectedOpt.getAttribute("data-nombre"),
    celularTecnico: selectedOpt.getAttribute("data-celular"),
    emailTecnico: selectedOpt.getAttribute("data-email"),
    fechaVisita: document.getElementById("asignacionFechaVisita").value,
    observacionesTrabajo: document.getElementById("asignacionObservaciones").value.trim(),
    tecnicaMantenimiento: document.getElementById("asignacionTecnica").value,
    nivelServicio: document.getElementById("asignacionNivelServicio").value,
    puntoServicio: AppState.activeTicket.puntoServicio,
    area: AppState.activeTicket.area || "",
    tipoServicio: AppState.activeTicket.tipoServicio || "",
    equipo: AppState.activeTicket.descripcionEquipo,
    placa: AppState.activeTicket.placa,
    descripcionSolicitud: AppState.activeTicket.descripcionSolicitud
  };

  const btn = document.getElementById("btnGuardarAsignacion");
  btn.disabled = true;
  btn.textContent = "Asignando...";

  const callback = function (res) {
    btn.disabled = false;
    btn.textContent = "Confirmar Asignación";
    if (!res) {
      mostrarAlerta("No se recibió respuesta del servidor al asignar ticket. Verifica la conexión o la versión desplegada en GAS.", "danger");
      console.error("asignarTicket devolvió null.");
      return;
    }
    if (res.success) {
      cerrarModal("modalAsignarTicket");
      mostrarAlerta(res.message, "success");
      cargarTickets();
    } else {
      mostrarAlerta("Error: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Confirmar Asignación";
        mostrarAlerta("Error: " + err, "danger");
      })
      .asignarTicket(asignacionData);
  } else {
    llamarApiBackend("asignarTicket", { asignacionData: asignacionData }).then(callback);
  }
}

// ============================================================================
// 6. CIERRE / GESTIÓN DE TICKET (TÉCNICO)
// ============================================================================
function abrirModalCierre(nroTicket) {
  const ticket = AppState.tickets.find(t => t.nroTicket === nroTicket);
  if (!ticket) return;

  AppState.activeTicket = ticket;
  document.getElementById("cierreNroTicket").textContent = ticket.nroTicket;
  document.getElementById("cierreEquipoInfo").textContent = ticket.descripcionEquipo + " | Punto: " + ticket.puntoServicio;
  
  // 1. Poblar tipos de falla según el técnico / área (TIC vs Mantenimiento)
  const areaFalla = determinarAreaParaFalla(ticket);
  poblarTiposFallaPorArea(areaFalla);

  // 2. Limpiar formulario para evitar datos residuales de otro ticket
  document.getElementById("formCierreTicket").reset();
  removerFoto('cierre');

  // 3. ¡PRECARGAR TODOS LOS DATOS PREVIAMENTE GUARDADOS!
  document.getElementById("cierrePlacaModificada").value = ticket.placa || "";

  // Tipo de Falla
  if (ticket.tipoFalla) {
    const selFalla = document.getElementById("cierreTipoFalla");
    if (selFalla) {
      selFalla.value = ticket.tipoFalla;
      // Si por alguna razón no coincidió exactamente, buscar coincidencia parcial
      if (!selFalla.value) {
        for (let i = 0; i < selFalla.options.length; i++) {
          if (selFalla.options[i].text.toLowerCase().includes(ticket.tipoFalla.toLowerCase())) {
            selFalla.selectedIndex = i;
            break;
          }
        }
      }
    }
  }

  // Repuestos guardados (formato "Condición - Detalle")
  if (ticket.repuesto) {
    const repStr = String(ticket.repuesto).trim();
    if (repStr && repStr !== "Ninguno") {
      const partesRep = repStr.split(" - ");
      const selRep = document.getElementById("cierreRepuesto");
      const detRep = document.getElementById("cierreDetalleRepuesto");
      if (selRep && partesRep[0]) selRep.value = partesRep[0];
      if (detRep && partesRep[1]) detRep.value = partesRep.slice(1).join(" - ");
      else if (detRep && !partesRep[1]) detRep.value = repStr;
    }
  }

  // Mostrar la indicación o instrucción que dejó el coordinador al asignar
  const estadoTicketActual = (ticket.estado || "").toUpperCase();
  const instruccionCoord = (ticket.observacionesAsignacion || (estadoTicketActual === "PROCESO" ? ticket.respuesta : "") || "").trim();
  const elInstruccion = document.getElementById("cierreInstruccionCoordinador");
  if (elInstruccion) {
    elInstruccion.textContent = instruccionCoord ? instruccionCoord : "(Sin observaciones adicionales de la coordinación al asignar)";
  }

  // Observación / Razón por la cual queda PENDIENTE
  if (ticket.razonNoFuncionamiento) {
    document.getElementById("cierreRazonNoOperativo").value = ticket.razonNoFuncionamiento;
  } else if (ticket.respuesta && ticket.respuesta.indexOf("[PENDIENTE:") !== -1) {
    const matchRazon = ticket.respuesta.match(/\[PENDIENTE:\s*(.*?)\]/);
    if (matchRazon && matchRazon[1]) {
      document.getElementById("cierreRazonNoOperativo").value = matchRazon[1].trim();
    }
  }

  // Observación del trabajo realizado (¿Qué se hizo? - Llenado por el Técnico):
  // Si el ticket apenas está en PROCESO, dejar el campo en blanco para que el técnico escriba lo que hizo.
  // Solo si ya fue guardado previamente en PENDIENTE o CERRADO con una respuesta técnica real, precargarla.
  let obsTecnico = "";
  if (estadoTicketActual !== "PROCESO" && ticket.respuesta && ticket.respuesta.trim() !== instruccionCoord) {
    obsTecnico = ticket.respuesta;
    if (obsTecnico.indexOf("[PENDIENTE:") !== -1) {
      obsTecnico = obsTecnico.replace(/\[PENDIENTE:\s*.*?\]\s*/, "");
    }
  }
  document.getElementById("cierreObservacion").value = obsTecnico.trim();

  // Quién recibe y cédula: Se traen automáticamente de quien creó la incidencia/ticket
  const nombreSol = ticket.nombreUsuario || ticket.nombreQuienRecibe || "";
  const cedulaSol = ticket.cedulaSolicitante || ticket.cedulaQuienRecibe || "";
  document.getElementById("cierreQuienRecibe").value = nombreSol;
  document.getElementById("cierreCedulaRecibe").value = cedulaSol;

  // Evidencia fotográfica previa si existe
  if (ticket.fotoCierreUrl) {
    const box = document.getElementById("cierreFotoPreview");
    const img = document.getElementById("cierreFotoImg");
    const name = document.getElementById("cierreFotoNombre");
    if (box && img) {
      img.src = obtenerDriveThumbnailUrl(ticket.fotoCierreUrl, 400);
      if (name) name.textContent = "Evidencia de cierre registrada ↗";
      box.style.display = "flex";
    }
  }

  // Toggle de funcionamiento y estado
  const estadoTicket = (ticket.estado || "").toUpperCase();
  const esPend = estadoTicket === "PENDIENTE" || (!ticket.equipoEnFuncionamiento && ticket.razonNoFuncionamiento);

  if (esPend) {
    document.getElementById("operativoNo").checked = true;
    document.getElementById("cierreEstadoFinal").value = "PENDIENTE";
  } else {
    document.getElementById("operativoSi").checked = true;
    document.getElementById("cierreEstadoFinal").value = "CERRADO";
  }
  onOperativoToggle();

  abrirModal("modalCierreTicket");
}

function onOperativoToggle() {
  const radioSi = document.getElementById("operativoSi").checked;
  const containerRazon = document.getElementById("razonNoOperativoContainer");
  const estadoFinalSel = document.getElementById("cierreEstadoFinal");
  const btnGuardar = document.getElementById("btnGuardarCierre");
  const razonInput = document.getElementById("cierreRazonNoOperativo");

  if (radioSi) {
    containerRazon.style.display = "none";
    if (razonInput) razonInput.required = false;
    if (estadoFinalSel) estadoFinalSel.value = "CERRADO";
    if (btnGuardar) {
      btnGuardar.textContent = "Finalizar y Cerrar Ticket";
      btnGuardar.className = "btn btn-success";
      btnGuardar.style.backgroundColor = "";
      btnGuardar.style.borderColor = "";
    }
  } else {
    containerRazon.style.display = "block";
    if (razonInput) razonInput.required = true;
    if (estadoFinalSel) estadoFinalSel.value = "PENDIENTE";
    if (btnGuardar) {
      btnGuardar.textContent = "Guardar como Ticket PENDIENTE";
      btnGuardar.className = "btn btn-warning";
      btnGuardar.style.backgroundColor = "#d97706";
      btnGuardar.style.borderColor = "#b45309";
    }
  }
}

function onEstadoFinalChange() {
  const estado = document.getElementById("cierreEstadoFinal").value;
  const radioSi = document.getElementById("operativoSi");
  const radioNo = document.getElementById("operativoNo");
  if (estado === "PENDIENTE") {
    if (radioNo) radioNo.checked = true;
    onOperativoToggle();
  } else if (estado === "CERRADO") {
    if (radioSi) radioSi.checked = true;
    onOperativoToggle();
  }
}

function guardarCierreTicket(e) {
  e.preventDefault();
  const operativoSi = document.getElementById("operativoSi").checked;
  const estadoElegido = document.getElementById("cierreEstadoFinal").value;
  const esPendiente = !operativoSi || estadoElegido === "PENDIENTE";
  const estadoFinal = esPendiente ? "PENDIENTE" : "CERRADO";
  const razonNoOperativo = document.getElementById("cierreRazonNoOperativo").value.trim();

  if (esPendiente && !razonNoOperativo) {
    mostrarAlerta("Debe especificar la razón por la cual el ticket queda PENDIENTE.", "warning");
    document.getElementById("cierreRazonNoOperativo").focus();
    return;
  }

  const cierreData = {
    nroTicket: AppState.activeTicket.nroTicket,
    tipoFalla: document.getElementById("cierreTipoFalla").value,
    repuestosUsados: document.getElementById("cierreRepuesto").value + " - " + document.getElementById("cierreDetalleRepuesto").value.trim(),
    observacionTrabajo: document.getElementById("cierreObservacion").value.trim(),
    equipoEnFuncionamiento: !esPendiente,
    razonNoFuncionamiento: esPendiente ? razonNoOperativo : "",
    quienRecibe: document.getElementById("cierreQuienRecibe").value.trim() || AppState.activeTicket.nombreUsuario || AppState.activeTicket.nombreQuienRecibe || "",
    cedulaQuienRecibe: document.getElementById("cierreCedulaRecibe").value.trim() || AppState.activeTicket.cedulaSolicitante || AppState.activeTicket.cedulaQuienRecibe || "",
    placaModificada: document.getElementById("cierrePlacaModificada").value.trim(),
    estado: estadoFinal,
    puntoServicio: AppState.activeTicket.puntoServicio,
    emailPunto: "",
    emailSolicitante: AppState.activeTicket.emailSolicitante || "",
    cedulaSolicitante: AppState.activeTicket.cedulaSolicitante || "",
    emailTecnico: AppState.currentUser.email || "",
    cedulaTecnico: AppState.currentUser.cedula || "",
    nombreTecnico: AppState.currentUser.nombres,
    equipo: AppState.activeTicket.descripcionEquipo,
    placa: AppState.activeTicket.placa,
    fotoBase64: window.tempFotoCierreBase64 || ""
  };

  if (!cierreData.observacionTrabajo) {
    mostrarAlerta("Ingrese la observación del trabajo realizado.", "warning");
    return;
  }

  const btn = document.getElementById("btnGuardarCierre");
  btn.disabled = true;
  btn.textContent = esPendiente ? "Guardando estado PENDIENTE..." : "Finalizando y Cerrando Ticket...";

  const callback = function (res) {
    btn.disabled = false;
    btn.textContent = esPendiente ? "Guardar como Ticket PENDIENTE" : "Finalizar y Cerrar Ticket";
    if (!res) {
      mostrarAlerta("No se recibió respuesta del servidor al guardar el cierre del ticket.", "danger");
      return;
    }
    if (res.success) {
      cerrarModal("modalCierreTicket");
      mostrarAlerta(res.message, "success");
      cargarTickets();
    } else {
      mostrarAlerta("Error: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        btn.disabled = false;
        btn.textContent = "Finalizar y Cerrar Ticket";
        mostrarAlerta("Error: " + err, "danger");
      })
      .cerrarTicket(cierreData);
  } else {
    llamarApiBackend("cerrarTicket", { cierreData: cierreData }).then(callback);
  }
}

// ============================================================================
// 7. MODIFICAR PLACA RÁPIDO
// ============================================================================
function abrirModalEditarPlaca(nroTicket, placaActual) {
  AppState.activeTicket = { nroTicket: nroTicket, placa: placaActual };
  document.getElementById("editarPlacaTicket").textContent = nroTicket;
  document.getElementById("inputNuevaPlaca").value = placaActual || "";
  abrirModal("modalEditarPlaca");
}

function guardarModificacionPlaca(e) {
  e.preventDefault();
  const nuevaPlaca = document.getElementById("inputNuevaPlaca").value.trim();
  if (!nuevaPlaca) return;

  const callback = function (res) {
    if (!res) {
      mostrarAlerta("No se recibió respuesta al modificar la placa.", "danger");
      return;
    }
    if (res.success) {
      cerrarModal("modalEditarPlaca");
      mostrarAlerta("Placa actualizada correctamente.", "success");
      cargarTickets();
    } else {
      mostrarAlerta("Error: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) { mostrarAlerta(err, "danger"); })
      .modificarPlaca(AppState.activeTicket.nroTicket, nuevaPlaca);
  } else {
    llamarApiBackend("modificarPlaca", { nroTicket: AppState.activeTicket.nroTicket, nuevaPlaca: nuevaPlaca }).then(callback);
  }
}

// ============================================================================
// 8. DETALLE COMPLETO Y ACORDEÓN (3 SECCIONES)
// ============================================================================
function verDetalleTicket(nroTicket) {
  const t = AppState.tickets.find(ticket => ticket.nroTicket === nroTicket);
  if (!t) return;
  AppState.activeTicket = t;

  document.getElementById("detalleTitulo").textContent = `Detalle del Ticket: ${t.nroTicket}`;
  
  // Sección 1: Solicitud
  const elFechaIngreso = document.getElementById("detFechaIngreso");
  if (elFechaIngreso) elFechaIngreso.textContent = t.fechaIngreso || "-";
  document.getElementById("detPunto").textContent = t.puntoServicio || "-";
  document.getElementById("detArea").textContent = t.area || "-";
  document.getElementById("detServicio").textContent = t.tipoServicio || "-";
  document.getElementById("detSolicitante").textContent = `${t.nombreUsuario} (C.C. ${t.cedulaSolicitante})`;
  const elDetCel = document.getElementById("detCelularSolicitante");
  if (elDetCel) elDetCel.textContent = t.celularSolicitante || "-";
  document.getElementById("detEmail").textContent = t.emailSolicitante || "-";
  document.getElementById("detEquipo").textContent = t.descripcionEquipo || "-";
  document.getElementById("detPlaca").textContent = t.placa || "-";
  document.getElementById("detDescripcion").textContent = t.descripcionSolicitud || "-";

  // Sección 2: Asignación
  document.getElementById("detTecnico").textContent = t.responsable ? `${t.responsable} (C.C. ${t.cedulaResponsable})` : "Pendiente de Asignación";
  const elFechaAsig = document.getElementById("detFechaAsignacion");
  if (elFechaAsig) elFechaAsig.textContent = t.fechaAsignacion || "-";
  document.getElementById("detFechaVisita").textContent = t.fechaVisita || "No programada";
  document.getElementById("detTecnica").textContent = t.tecnicaMantenimiento || "-";
  document.getElementById("detObsAsignacion").textContent = t.observacionesAsignacion || "-";

  // Sección 3: Cierre
  document.getElementById("detFechaCierre").textContent = t.fechaCierre || "En Proceso";
  document.getElementById("detEstadoFinal").textContent = t.estado || "-";
  document.getElementById("detFalla").textContent = t.tipoFalla || "-";
  document.getElementById("detRepuestos").textContent = t.repuesto || "-";

  // Mostrar razón por la cual queda PENDIENTE si existe
  const contRazon = document.getElementById("detRazonPendienteItem");
  const elRazon = document.getElementById("detRazonPendiente");
  if (contRazon && elRazon) {
    if (t.razonNoFuncionamiento) {
      contRazon.style.display = "block";
      elRazon.textContent = t.razonNoFuncionamiento;
    } else {
      contRazon.style.display = "none";
      elRazon.textContent = "";
    }
  }

  // Trabajo Realizado / Avance del Técnico
  const elDetTrabajo = document.getElementById("detTrabajo");
  if (elDetTrabajo) {
    elDetTrabajo.textContent = t.respuesta || "-";
  }

  const receptorNombre = t.nombreQuienRecibe || t.nombreUsuario || "";
  const receptorCedula = t.cedulaQuienRecibe || t.cedulaSolicitante || "";
  document.getElementById("detRecibe").textContent = receptorNombre ? `${receptorNombre}${receptorCedula ? ' (C.C. ' + receptorCedula + ')' : ''}` : "-";
  
  // Renderizar evidencias fotográficas si existen
  const contFotoSol = document.getElementById("detFotoSolicitudItem");
  const elFotoSol = document.getElementById("detFotoSolicitudContent");
  if (contFotoSol && elFotoSol) {
    if (t.fotoSolicitudUrl) {
      contFotoSol.style.display = "block";
      elFotoSol.innerHTML = renderizarComponenteFoto(t.fotoSolicitudUrl, `Evidencia Solicitud - ${t.nroTicket}`);
    } else {
      contFotoSol.style.display = "none";
      elFotoSol.innerHTML = "";
    }
  }

  const contFotoCierre = document.getElementById("detFotoCierreItem");
  const elFotoCierre = document.getElementById("detFotoCierreContent");
  if (contFotoCierre && elFotoCierre) {
    if (t.fotoCierreUrl) {
      contFotoCierre.style.display = "block";
      elFotoCierre.innerHTML = renderizarComponenteFoto(t.fotoCierreUrl, `Evidencia de Cierre - ${t.nroTicket}`);
    } else {
      contFotoCierre.style.display = "none";
      elFotoCierre.innerHTML = "";
    }
  }

  // Sección 4: Gestión Administrativa (Administradora / Costos)
  const cardAdmin = document.getElementById("detFaseAdminCard");
  const tieneDatosAdmin = !!(t.costo || t.aprobacion || t.obsAdmin || t.consultaAdmin || t.proveedor);
  const rolUserActivo = String(AppState.currentUser && AppState.currentUser.tipoUsuario || "").toLowerCase();
  const puedeGestionarCostos = tienePermiso("GESTIONAR_COSTOS") || rolUserActivo === "administradora" || rolUserActivo.includes("administrador");

  if (cardAdmin) {
    if (tieneDatosAdmin || puedeGestionarCostos) {
      cardAdmin.style.display = "block";
      const elCosto = document.getElementById("detCosto");
      if (elCosto) elCosto.textContent = t.costo || "Sin costo registrado";
      const elAprob = document.getElementById("detAprobacion");
      if (elAprob) elAprob.textContent = t.aprobacion || "Sin definir";
      const elProv = document.getElementById("detProveedor");
      if (elProv) elProv.textContent = t.proveedor || "No asignado";
      const elCons = document.getElementById("detConsultaAdmin");
      if (elCons) elCons.textContent = t.consultaAdmin || "-";
      const elObsAdm = document.getElementById("detObsAdmin");
      if (elObsAdm) elObsAdm.textContent = t.obsAdmin || "-";
    } else {
      cardAdmin.style.display = "none";
    }
  }

  const btnAdminContainer = document.getElementById("detBtnAdminContainer");
  if (btnAdminContainer) {
    btnAdminContainer.style.display = (tienePermiso("GESTIONAR_COSTOS") || rolUserActivo === "administradora") ? "block" : "none";
  }

  // Mostrar acceso al Acta de Entrega Técnica si el ticket está CERRADO
  const esCerrado = String(t.estado || "").toUpperCase() === "CERRADO" || !!t.fechaCierre;
  const bannerActa = document.getElementById("detActaBanner");
  if (bannerActa) {
    bannerActa.style.display = esCerrado ? "flex" : "none";
  }
  const btnVerActaFooter = document.getElementById("detBtnVerActaFooter");
  if (btnVerActaFooter) {
    btnVerActaFooter.style.display = esCerrado ? "inline-flex" : "none";
  }

  abrirModal("modalDetalleTicket");
}

// ============================================================================
// 9. UTILIDADES Y MANEJO DE IMÁGENES & GOOGLE DRIVE
// ============================================================================
function manejarSeleccionFoto(input, tipo) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
      const base64 = e.target.result;
      if (tipo === "solicitud") {
        window.tempImagenSolicitudBase64 = base64;
        const box = document.getElementById("solicitudFotoPreview");
        const img = document.getElementById("solicitudFotoImg");
        const nombre = document.getElementById("solicitudFotoNombre");
        if (box && img && nombre) {
          img.src = base64;
          nombre.textContent = file.name;
          box.style.display = "flex";
        }
      } else if (tipo === "cierre") {
        window.tempFotoCierreBase64 = base64;
        const box = document.getElementById("cierreFotoPreview");
        const img = document.getElementById("cierreFotoImg");
        const nombre = document.getElementById("cierreFotoNombre");
        if (box && img && nombre) {
          img.src = base64;
          nombre.textContent = file.name;
          box.style.display = "flex";
        }
      }
    };
    reader.readAsDataURL(file);
  }
}

function removerFoto(tipo) {
  if (tipo === "solicitud") {
    window.tempImagenSolicitudBase64 = "";
    const input = document.getElementById("solicitudFotoInput");
    if (input) input.value = "";
    const box = document.getElementById("solicitudFotoPreview");
    if (box) box.style.display = "none";
  } else if (tipo === "cierre") {
    window.tempFotoCierreBase64 = "";
    const input = document.getElementById("cierreFotoInput");
    if (input) input.value = "";
    const box = document.getElementById("cierreFotoPreview");
    if (box) box.style.display = "none";
  }
}

function procesarImagenUpload(input, targetVar) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      window[targetVar] = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// Extrae el File ID de cualquier enlace de Google Drive
function extraerDriveId(url) {
  if (!url) return "";
  const str = String(url).trim();
  const matchD = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const matchId = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchD) return matchD[1];
  if (matchId) return matchId[1];
  if (str.length > 20 && !str.includes("/") && !str.includes(".")) return str;
  return "";
}

// Genera la URL de miniatura directa para visualización web
function obtenerDriveThumbnailUrl(driveUrl, ancho) {
  if (!driveUrl) return "";
  ancho = ancho || 800;
  if (driveUrl.indexOf("data:image") === 0) return driveUrl;
  var id = extraerDriveId(driveUrl);
  if (id) {
    return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w" + ancho;
  }
  return driveUrl;
}

// Genera la URL directa de Google Drive para abrir en una nueva pestaña
function obtenerDriveViewUrl(driveUrl) {
  var folderUrl = "https://drive.google.com/drive/folders/1h6-vMUtci8YKuWISrpm9Fm7nUXkn0C1X";
  if (!driveUrl) return folderUrl;
  if (driveUrl.indexOf("data:image") === 0) return driveUrl;
  var id = extraerDriveId(driveUrl);
  if (id) {
    return "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/view?usp=sharing";
  }
  return driveUrl;
}

// Renderiza una tarjeta de imagen con vista previa interactiva y enlace directo a Drive
function renderizarComponenteFoto(driveUrl, titulo) {
  if (!driveUrl) return "";
  var thumbUrl = obtenerDriveThumbnailUrl(driveUrl, 600);
  var viewUrl = obtenerDriveViewUrl(driveUrl);
  var safeTitulo = (titulo || "Evidencia Fotográfica").replace(/'/g, "\\'");

  return '<div class="evidence-card">' +
    '<div class="evidence-thumb-wrapper" onclick="abrirLightbox(\'' + driveUrl + '\', \'' + safeTitulo + '\')" title="Clic para ampliar imagen">' +
      '<img src="' + thumbUrl + '" alt="Evidencia" loading="lazy" onerror="onImageError(this, \'' + driveUrl + '\')">' +
      '<div class="evidence-overlay-zoom">' +
        '<span>🔍 Clic para ampliar</span>' +
      '</div>' +
    '</div>' +
    '<div class="evidence-actions">' +
      '<span style="font-size: 0.75rem; color: var(--text-dim);">Google Drive</span>' +
      '<a href="' + viewUrl + '" target="_blank" rel="noopener noreferrer" class="btn-drive-link">' +
        '<span>📁</span> Abrir en Drive ↗' +
      '</a>' +
    '</div>' +
  '</div>';
}

function onImageError(imgEl, originalUrl) {
  if (AppState.isGAS && originalUrl && !originalUrl.startsWith("data:")) {
    google.script.run
      .withSuccessHandler(function(res) {
        if (res && res.success && res.dataUrl) {
          imgEl.src = res.dataUrl;
        } else if (originalUrl && !originalUrl.startsWith("data:")) {
    llamarApiBackend("obtenerImagenDrive", { urlOId: originalUrl }).then(function(res) {
      if (res && res.success && res.dataUrl) {
        imgEl.src = res.dataUrl;
      } else {
        mostrarFallbackImg(imgEl, originalUrl);
      }
    }).catch(function() {
      mostrarFallbackImg(imgEl, originalUrl);
    });
  } else {
    mostrarFallbackImg(imgEl, originalUrl);
  }
      })
      .withFailureHandler(function() {
        mostrarFallbackImg(imgEl, originalUrl);
      })
      .obtenerImagenDriveBase64(originalUrl);
  } else if (originalUrl && !originalUrl.startsWith("data:")) {
    llamarApiBackend("obtenerImagenDrive", { urlOId: originalUrl }).then(function(res) {
      if (res && res.success && res.dataUrl) {
        imgEl.src = res.dataUrl;
      } else {
        mostrarFallbackImg(imgEl, originalUrl);
      }
    }).catch(function() {
      mostrarFallbackImg(imgEl, originalUrl);
    });
  } else {
    mostrarFallbackImg(imgEl, originalUrl);
  }
}

function mostrarFallbackImg(imgEl, originalUrl) {
  const parent = imgEl.parentElement;
  if (parent) {
    parent.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
        <span style="font-size: 2rem; display: block; margin-bottom: 0.35rem;">🖼️</span>
        <span style="font-size: 0.82rem; display: block; color: #93c5fd; font-weight: 600;">Ver Evidencia Adjunta</span>
        <span style="font-size: 0.72rem; color: var(--text-dim);">Clic para ver en Google Drive</span>
      </div>
    `;
    parent.onclick = function() {
      window.open(obtenerDriveViewUrl(originalUrl), "_blank");
    };
  }
}

// Visor en pantalla completa (Lightbox)
function abrirLightbox(driveUrl, titulo) {
  if (!driveUrl) return;
  const thumbUrl = obtenerDriveThumbnailUrl(driveUrl, 1600);
  const viewUrl = obtenerDriveViewUrl(driveUrl);

  const elTitulo = document.getElementById("lightboxTitulo");
  const elImg = document.getElementById("lightboxImg");
  const elBtn = document.getElementById("lightboxDriveBtn");

  if (elTitulo) elTitulo.textContent = titulo || "Evidencia Fotográfica";
  if (elImg) {
    elImg.src = thumbUrl;
    elImg.onerror = function() {
      onImageError(this, driveUrl);
    };
  }
  if (elBtn) elBtn.href = viewUrl;

  abrirModal("modalLightbox");
}

function cerrarLightbox(event) {
  if (event.target.id === "modalLightbox" || event.target.classList.contains("modal-backdrop")) {
    cerrarModal("modalLightbox");
  }
}

function verFotoTicket(nroTicket, driveUrl, tipo) {
  abrirLightbox(driveUrl, `Ticket ${nroTicket} - Evidencia de ${tipo}`);
}

function abrirModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}

function cerrarModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
  if (modalId === "modalNuevoTicket" && window.relojModalInterval) {
    clearInterval(window.relojModalInterval);
    window.relojModalInterval = null;
  }
}

// ============================================================================
// 10.5 FUNCIONES RECLUTADOR / RECURSOS HUMANOS
// ============================================================================

/** Datos de empleados cargados desde Excel, esperando confirmación */
var _datosEmpleadosMasivoPendientes = [];

/** Abre el modal de gestión de empleados (RRHH) */
function abrirModalGestionEmpleados() {
  limpiarCargaMasiva();
  cambiarTabEmpleados('individual');
  document.getElementById('formNuevoEmpleado').reset();
  abrirModal('modalGestionEmpleados');
}

/** Abre el modal para registrar un nuevo punto de servicio */
function abrirModalNuevoPunto() {
  const form = document.getElementById('formNuevoPunto');
  if (form) form.reset();
  abrirModal('modalNuevoPunto');
}

/** Cambia entre pestaña individual y masiva */
function cambiarTabEmpleados(tab) {
  const tabIndividual = document.getElementById('tabContentIndividual');
  const tabMasivo = document.getElementById('tabContentMasivo');
  const btnIndividual = document.getElementById('tabBtnIndividual');
  const btnMasivo = document.getElementById('tabBtnMasivo');

  if (tab === 'individual') {
    tabIndividual.style.display = 'block';
    tabMasivo.style.display = 'none';
    btnIndividual.classList.add('active');
    btnMasivo.classList.remove('active');
  } else {
    tabIndividual.style.display = 'none';
    tabMasivo.style.display = 'block';
    btnIndividual.classList.remove('active');
    btnMasivo.classList.add('active');
  }
}

/** Guarda un empleado individual en la hoja EMPLEADOS */
function guardarEmpleadoIndividual(e) {
  e.preventDefault();
  const elPermisos = document.getElementById('empPermisos');
  const datos = {
    cedula: document.getElementById('empCedula').value.trim(),
    nombres: document.getElementById('empNombres').value.trim().toUpperCase(),
    email: document.getElementById('empEmail').value.trim(),
    celular: document.getElementById('empCelular').value.trim(),
    tipoUsuario: document.getElementById('empTipoUsuario').value,
    area: document.getElementById('empArea').value.trim().toUpperCase(),
    permisos: elPermisos ? elPermisos.value.trim().toUpperCase() : ""
  };

  if (!datos.cedula || !datos.nombres || !datos.email || !datos.celular) {
    mostrarAlerta('Todos los campos marcados con * son obligatorios.', 'warning');
    return;
  }

  const btn = document.getElementById('btnGuardarEmpleado');
  btn.disabled = true;
  btn.textContent = 'Registrando...';

  const callback = function(res) {
    btn.disabled = false;
    btn.textContent = 'Registrar Empleado';
    if (res.success) {
      mostrarAlerta(res.message, 'success');
      document.getElementById('formNuevoEmpleado').reset();
      cerrarModal('modalGestionEmpleados');
    } else {
      mostrarAlerta('Error: ' + res.message, 'danger');
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function(err) {
        btn.disabled = false;
        btn.textContent = 'Registrar Empleado';
        mostrarAlerta('Error de conexión: ' + err, 'danger');
      })
      .agregarEmpleadoIndividual(datos);
  } else {
    llamarApiBackend("agregarEmpleadoIndividual", datos).then(callback);
  }
}

/** Procesa un archivo Excel (.xlsx/.xls/.csv) con la lista de empleados */
function procesarArchivoExcelEmpleados(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  // Mostrar nombre del archivo
  const nombreEl = document.getElementById('excelNombreArchivo');
  if (nombreEl) { nombreEl.textContent = '📄 ' + file.name; nombreEl.style.display = 'block'; }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (rows.length < 2) {
        mostrarAlerta('El archivo está vacío o no tiene datos suficientes.', 'warning');
        return;
      }

      // Detectar si la primera fila es encabezado o datos
      const primeraFila = rows[0].map(function(c) { return String(c).toLowerCase().trim(); });
      const esEncabezado = primeraFila.some(function(c) {
        return c.indexOf('cedula') !== -1 || c.indexOf('nombre') !== -1 || c.indexOf('email') !== -1;
      });

      const dataRows = esEncabezado ? rows.slice(1) : rows;

      _datosEmpleadosMasivoPendientes = dataRows
        .filter(function(row) { return row.some(function(c) { return String(c).trim() !== ''; }); })
        .map(function(row) {
          return {
            cedula: String(row[0] || '').trim(),
            nombres: String(row[1] || '').trim().toUpperCase(),
            email: String(row[2] || '').trim(),
            celular: String(row[3] || '').trim(),
            tipoUsuario: String(row[4] || 'Empleado').trim() || 'Empleado',
            area: String(row[5] || 'OPERACIONES').trim().toUpperCase() || 'OPERACIONES',
            permisos: String(row[6] || '').trim().toUpperCase()
          };
        })
        .filter(function(emp) { return emp.cedula !== '' && emp.nombres !== ''; });

      mostrarVistaPreviewMasivo();
    } catch (err) {
      mostrarAlerta('Error al leer el archivo: ' + err.message, 'danger');
    }
  };
  reader.readAsArrayBuffer(file);
}

/** Parsea texto pegado directamente desde Excel (columnas separadas por tab) */
function analizarTextoPegado() {
  const texto = document.getElementById('textareaPegarEmpleados').value.trim();
  if (!texto) {
    mostrarAlerta('Pega el contenido copiado de Excel en el área de texto.', 'warning');
    return;
  }

  const lineas = texto.split('\n');
  _datosEmpleadosMasivoPendientes = lineas
    .map(function(linea) {
      const cols = linea.split('\t').map(function(c) { return c.trim(); });
      return {
        cedula: cols[0] || '',
        nombres: (cols[1] || '').toUpperCase(),
        email: cols[2] || '',
        celular: cols[3] || '',
        tipoUsuario: cols[4] || 'Empleado',
        area: (cols[5] || 'OPERACIONES').toUpperCase(),
        permisos: (cols[6] || '').toUpperCase()
      };
    })
    .filter(function(emp) { return emp.cedula !== '' && emp.nombres !== ''; });

  mostrarVistaPreviewMasivo();
}

/** Muestra la tabla de vista previa con los empleados cargados */
function mostrarVistaPreviewMasivo() {
  const container = document.getElementById('previewContainerMasivo');
  const badge = document.getElementById('previewCountBadge');
  const tbody = document.getElementById('previewTableBody');
  const btnImportar = document.getElementById('btnImportarMasivo');

  if (!container || !badge || !tbody || !btnImportar) return;

  const total = _datosEmpleadosMasivoPendientes.length;
  badge.textContent = total + ' empleado' + (total !== 1 ? 's' : '') + ' detectado' + (total !== 1 ? 's' : '');

  tbody.innerHTML = _datosEmpleadosMasivoPendientes.map(function(emp, i) {
    return `<tr>
      <td style="color: var(--text-dim);">${i + 1}</td>
      <td><strong>${emp.cedula}</strong></td>
      <td>${emp.nombres}</td>
      <td style="font-size:0.75rem;">${emp.email}</td>
      <td>${emp.celular}</td>
      <td><span style="font-size:0.75rem; background: rgba(99,102,241,0.15); color:#818cf8; padding: 0.15rem 0.45rem; border-radius: 4px;">${emp.tipoUsuario}</span></td>
      <td style="font-size:0.75rem;">${emp.area}</td>
      <td style="font-size:0.72rem; color: var(--text-muted);">${emp.permisos || '<em style="color: var(--text-dim);">Por rol</em>'}</td>
    </tr>`;
  }).join('');

  container.style.display = total > 0 ? 'block' : 'none';
  btnImportar.disabled = total === 0;
}

/** Limpia la lista de carga masiva */
function limpiarCargaMasiva() {
  _datosEmpleadosMasivoPendientes = [];
  const container = document.getElementById('previewContainerMasivo');
  const badge = document.getElementById('previewCountBadge');
  const tbody = document.getElementById('previewTableBody');
  const input = document.getElementById('inputExcelEmpleados');
  const textarea = document.getElementById('textareaPegarEmpleados');
  const nombreEl = document.getElementById('excelNombreArchivo');
  const btnImportar = document.getElementById('btnImportarMasivo');

  if (container) container.style.display = 'none';
  if (badge) badge.textContent = '0 empleados detectados';
  if (tbody) tbody.innerHTML = '';
  if (input) input.value = '';
  if (textarea) textarea.value = '';
  if (nombreEl) { nombreEl.textContent = ''; nombreEl.style.display = 'none'; }
  if (btnImportar) btnImportar.disabled = true;
}

/** Ejecuta la importación masiva enviando datos al backend */
function ejecutarImportacionMasiva() {
  if (!_datosEmpleadosMasivoPendientes.length) {
    mostrarAlerta('No hay empleados para importar. Carga un archivo Excel primero.', 'warning');
    return;
  }

  const btn = document.getElementById('btnImportarMasivo');
  btn.disabled = true;
  btn.textContent = '⏳ Importando ' + _datosEmpleadosMasivoPendientes.length + ' empleados...';

  const callback = function(res) {
    btn.textContent = '🚀 Importar Empleados a la Base de Datos';
    if (res.success) {
      mostrarAlerta('✅ ' + res.message, 'success');
      limpiarCargaMasiva();
      cerrarModal('modalGestionEmpleados');
    } else {
      btn.disabled = false;
      mostrarAlerta('Error: ' + res.message, 'danger');
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function(err) {
        btn.disabled = false;
        btn.textContent = '🚀 Importar Empleados a la Base de Datos';
        mostrarAlerta('Error de conexión: ' + err, 'danger');
      })
      .agregarEmpleadosMasivo(_datosEmpleadosMasivoPendientes);
  } else {
    llamarApiBackend("agregarEmpleadosMasivo", { empleados: _datosEmpleadosMasivoPendientes }).then(callback);
  }
}

/** Descarga una plantilla Excel de referencia para carga masiva */
function descargarPlantillaExcel() {
  try {
    const wb = XLSX.utils.book_new();
    const headers = ['CEDULA', 'NOMBRES APELLIDOS', 'EMAIL', 'CELULAR', 'TIPO USUARIO', 'AREA', 'PERMISOS'];
    const ejemplos = [
      ['1022922805', 'JUAN DAVID PINEDA', 'jdpineda@dialimentos.com.co', '3118019926', 'Empleado', 'OPERACIONES', 'CREAR'],
      ['79565579', 'JEOFFREY PARDO DIAZ', 'pardo@dialimentos.com.co', '3186666686', 'Administrador', 'TIC', 'ASIGNAR, CERRAR, FILTRAR, BUSCAR, EDITAR_PLACA, VER_TODOS']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
    // Ancho de columnas
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
    XLSX.writeFile(wb, 'Plantilla_Empleados_Dialimentos.xlsx');
  } catch (err) {
    mostrarAlerta('Error al generar la plantilla: ' + err.message, 'danger');
  }
}

/** Auto-genera un código corto para el punto de servicio */
function autogenerarCodigoPunto(nombre) {
  const codigoEl = document.getElementById('puntoCodigoInput');
  if (!codigoEl) return;
  // Tomar las primeras letras de cada palabra, máximo 8 caracteres
  const codigo = nombre.trim().toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .filter(function(p) { return p.length > 0; })
    .map(function(p) { return p.substring(0, 3); })
    .join('')
    .substring(0, 8);
  codigoEl.value = codigo;
}

/** Guarda un nuevo punto de servicio en la hoja PUNTOS */
function guardarNuevoPunto(e) {
  e.preventDefault();
  const nombre = document.getElementById('puntoNombreInput').value.trim();
  const codigo = document.getElementById('puntoCodigoInput').value.trim().toUpperCase();

  if (!nombre || !codigo) {
    mostrarAlerta('El nombre y código del punto son obligatorios.', 'warning');
    return;
  }

  const btn = document.getElementById('btnGuardarPunto');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const callback = function(res) {
    btn.disabled = false;
    btn.textContent = 'Guardar Punto de Servicio';
    if (res.success) {
      mostrarAlerta('✅ ' + res.message, 'success');
      // Agregar al select de puntos en el formulario de ticket sin recargar
      const selPunto = document.getElementById('solicitudPunto');
      if (selPunto && res.punto) {
        const label = res.punto.codigo ? `${res.punto.nombre} (${res.punto.codigo})` : res.punto.nombre;
        selPunto.innerHTML += `<option value="${res.punto.nombre}">${label}</option>`;
      }
      cerrarModal('modalNuevoPunto');
    } else {
      mostrarAlerta('Error: ' + res.message, 'danger');
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function(err) {
        btn.disabled = false;
        btn.textContent = 'Guardar Punto de Servicio';
        mostrarAlerta('Error de conexión: ' + err, 'danger');
      })
      .agregarPuntoServicio({ nombre: nombre, codigo: codigo });
  } else {
    llamarApiBackend("agregarPuntoServicio", { nombre: nombre, codigo: codigo }).then(callback);
  }
}

// ============================================================================
// 10. FUNCIONES DE FECHA Y HORA COLOMBIANA (UTC-5)
// ============================================================================
function actualizarRelojModal() {
  const el = document.getElementById("solicitudFechaHoraTexto");
  if (!el) return;
  const ahora = new Date();
  const opciones = {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  };
  const texto = ahora.toLocaleString("es-CO", opciones);
  el.innerHTML = `🕒 ${texto} <span style="font-size: 0.72rem; color: #94a3b8; font-weight: 500; margin-left: 0.35rem;">(Hora Colombia)</span>`;
}

function formatearFechaHoraCO(fechaStr) {
  if (!fechaStr) return "-";
  const s = String(fechaStr).trim();
  // Formato "yyyy-MM-dd HH:mm:ss" o "yyyy-MM-dd HH:mm"
  if (s.indexOf(" ") !== -1) {
    const partes = s.split(" ");
    const fecha = partes[0];
    const hora = partes[1].substring(0, 5); // HH:mm
    return `${fecha} <span style="color: var(--diali-purple); font-weight: 600;">${hora}</span>`;
  }
  // Formato ISO "yyyy-MM-ddTHH:mm:ss..."
  if (s.indexOf("T") !== -1) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const fecha = d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
        const hora = d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true });
        return `${fecha} <span style="color: var(--diali-purple); font-weight: 600;">${hora}</span>`;
      }
    } catch (e) {}
  }
  return s;
}

function mostrarAlerta(mensaje, tipo) {
  const toast = document.createElement("div");
  toast.className = `alert-toast alert-${tipo || 'info'}`;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${tipo === 'danger' ? '#ef4444' : tipo === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    padding: 14px 20px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    z-index: 9999;
    font-weight: 600;
    font-size: 0.9rem;
    animation: fadeIn 0.3s ease;
  `;
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// ============================================================================
// 11. MÓDULO ADMINISTRADORA
// ============================================================================

/**
 * Abre el modal de gestión exclusivo de la Administradora.
 * Permite ver todos los datos del ticket y registrar:
 * Costo, Aprobación, Observación, Consulta y Proveedor.
 */
function abrirModalAdministradora(nroTicket) {
  const t = AppState.tickets.find(ticket => ticket.nroTicket === nroTicket);
  if (!t) { mostrarAlerta("Ticket no encontrado.", "danger"); return; }

  AppState.activeTicket = t;

  // Encabezado
  const el = id => document.getElementById(id);
  if (el("admNroTicket"))      el("admNroTicket").textContent      = t.nroTicket;
  if (el("admEstado"))         el("admEstado").textContent         = t.estado;
  if (el("admPunto"))          el("admPunto").textContent          = t.puntoServicio    || "-";
  if (el("admSolicitante"))    el("admSolicitante").textContent    = t.nombreUsuario    || "-";
  if (el("admDescripcion"))    el("admDescripcion").textContent    = t.descripcionSolicitud || "-";
  if (el("admEquipo"))         el("admEquipo").textContent         = (t.descripcionEquipo || "Sin equipo") + (t.placa ? " | Placa: " + t.placa : "");
  if (el("admResponsable"))    el("admResponsable").textContent    = t.responsable      || "Sin Asignar";
  if (el("admTrabajo"))        el("admTrabajo").textContent        = t.respuesta        || "-";

  // Cargar valores guardados previamente (si existen en el ticket)
  if (el("admCosto"))         el("admCosto").value         = t.costo         || "";
  if (el("admAprobacion"))    el("admAprobacion").value    = t.aprobacion    || "";
  if (el("admObsAdmin"))      el("admObsAdmin").value      = t.obsAdmin      || "";
  if (el("admConsulta"))      el("admConsulta").value      = t.consultaAdmin || "";
  if (el("admProveedor"))     el("admProveedor").value     = t.proveedor     || "";

  abrirModal("modalAdministradora");
}

/** Guarda los campos de la Administradora en el backend */
function guardarCamposAdministradora(e) {
  e.preventDefault();
  if (!AppState.activeTicket) {
    mostrarAlerta("No hay ticket activo.", "danger");
    return;
  }

  const datos = {
    nroTicket:    AppState.activeTicket.nroTicket,
    costo:        document.getElementById("admCosto").value.trim(),
    aprobacion:   document.getElementById("admAprobacion").value.trim(),
    obsAdmin:     document.getElementById("admObsAdmin").value.trim(),
    consultaAdmin: document.getElementById("admConsulta").value.trim(),
    proveedor:    document.getElementById("admProveedor").value.trim()
  };

  const btn = document.getElementById("btnGuardarAdm");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

  const callback = function(res) {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar Cambios"; }
    if (!res) { mostrarAlerta("Sin respuesta del servidor.", "danger"); return; }
    if (res.success) {
      // Actualización reactiva instantánea en memoria
      if (AppState.activeTicket) {
        AppState.activeTicket.costo = datos.costo;
        AppState.activeTicket.aprobacion = datos.aprobacion;
        AppState.activeTicket.obsAdmin = datos.obsAdmin;
        AppState.activeTicket.consultaAdmin = datos.consultaAdmin;
        AppState.activeTicket.proveedor = datos.proveedor;
      }
      const tIdx = AppState.tickets.findIndex(x => x.nroTicket === datos.nroTicket);
      if (tIdx !== -1) {
        Object.assign(AppState.tickets[tIdx], datos);
      }
      cerrarModal("modalAdministradora");
      mostrarAlerta(res.message, "success");
      renderizarTablaTickets();
      cargarTickets();
    } else {
      mostrarAlerta("Error: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function(err) {
        if (btn) { btn.disabled = false; btn.textContent = "Guardar Cambios"; }
        mostrarAlerta("Error: " + err, "danger");
      })
      .actualizarCamposAdministradora(datos);
  } else {
    llamarApiBackend("actualizarCamposAdministradora", datos).then(callback);
  }
}

// ============================================================================
// 13. VISUALIZACIÓN Y DESCARGA DE ACTA DE ENTREGA TÉCNICA (PDF & PREVIEW)
// ============================================================================
function verActaTicket(nroTicket) {
  var t = AppState.tickets.find(function(ticket) { return ticket.nroTicket === nroTicket; });
  if (!t && AppState.activeTicket && AppState.activeTicket.nroTicket === nroTicket) {
    t = AppState.activeTicket;
  }
  if (!t) {
    mostrarToast("No se encontró información del ticket " + nroTicket, "warning");
    return;
  }

  AppState.activeActaTicket = t;

  // Actualizar títulos en el encabezado del modal
  var tituloModal = document.getElementById("actaModalTituloTexto");
  if (tituloModal) tituloModal.textContent = "Acta de Servicio Técnico — " + t.nroTicket;
  var badgeFooter = document.getElementById("actaFooterTicketBadge");
  if (badgeFooter) badgeFooter.textContent = "Ticket: " + t.nroTicket + " (" + (t.area || "Servicio") + ") — Dialimentos S.A.S.";

  // Formatear fechas
  var fechaEmision = t.fechaCierre || t.fechaIngreso || formatearFechaCO(new Date());
  var fechaSol = t.fechaIngreso || "-";
  var fechaAsig = t.fechaAsignacion || "-";
  var fechaVis = t.fechaVisita || "Correctivo en sitio";
  var fechaCie = t.fechaCierre || "-";

  // Formatear estado operativo del equipo
  var estadoOperativoHtml = "";
  if (t.equipoEnFuncionamiento) {
    estadoOperativoHtml = '<span class="acta-badge acta-badge-success">SÍ, OPERATIVO</span>';
  } else {
    var razon = t.razonNoFuncionamiento || "Por determinar";
    estadoOperativoHtml = '<span class="acta-badge acta-badge-danger">NO OPERATIVO</span> &mdash; <span style="color: #b91c1c; font-weight: 600;">Motivo: ' + razon + '</span>';
  }

  // Generar evidencias fotográficas si existen
  var evidenciasHtml = "";
  if (t.fotoSolicitudUrl || t.fotoCierreUrl) {
    evidenciasHtml += '<div class="acta-section-title">4. REGISTRO FOTOGRÁFICO DE EVIDENCIAS</div>' +
      '<div class="acta-evidence-grid">';

    if (t.fotoSolicitudUrl) {
      var thumbSol = obtenerDriveThumbnailUrl(t.fotoSolicitudUrl, 400);
      evidenciasHtml += '<div class="acta-evidence-card">' +
        '<div class="acta-evidence-label">📷 Evidencia Solicitud Inicial</div>' +
        '<img src="' + thumbSol + '" alt="Evidencia Solicitud" class="acta-evidence-img" onclick="abrirLightbox(\'' + t.fotoSolicitudUrl + '\', \'Evidencia Solicitud - ' + t.nroTicket + '\')" style="cursor: pointer;" onerror="this.parentElement.style.display=\'none\'">' +
        '</div>';
    }

    if (t.fotoCierreUrl) {
      var thumbCie = obtenerDriveThumbnailUrl(t.fotoCierreUrl, 400);
      evidenciasHtml += '<div class="acta-evidence-card">' +
        '<div class="acta-evidence-label">📸 Evidencia Trabajo Finalizado (Cierre)</div>' +
        '<img src="' + thumbCie + '" alt="Evidencia Cierre" class="acta-evidence-img" onclick="abrirLightbox(\'' + t.fotoCierreUrl + '\', \'Evidencia Cierre - ' + t.nroTicket + '\')" style="cursor: pointer;" onerror="this.parentElement.style.display=\'none\'">' +
        '</div>';
    }

    evidenciasHtml += '</div>';
  }

  var receptorNombre = t.nombreQuienRecibe || t.nombreUsuario || "SOLICITANTE / RESPONSABLE";
  var receptorCedula = t.cedulaQuienRecibe || t.cedulaSolicitante || "N/A";
  var tecnicoNombre = t.responsable || "TÉCNICO RESPONSABLE";
  var tecnicoCedula = t.cedulaResponsable || "N/A";

  // Generar HTML del documento oficial idéntico al enviado por correo
  var actaHtml =
    '<div class="acta-header">' +
      '<div class="acta-brand-col">' +
        '<div class="acta-company-title">DIALIMENTOS S.A.S.</div>' +
        '<div class="acta-company-sub">UNA MARCA OPERADA POR DIALIMENTOS S.A.S. &bull; NIT 900.000.000-0</div>' +
        '<div class="acta-doc-title">ACTA DE SERVICIO TÉCNICO & MANTENIMIENTO</div>' +
      '</div>' +
      '<div class="acta-ticket-badge-box">' +
        '<div class="acta-ticket-badge">' + (t.nroTicket || "TICKET") + '</div>' +
        '<div class="acta-ticket-date">Fecha Emisión: ' + fechaEmision + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="acta-section-title">1. INFORMACIÓN DE LA SOLICITUD</div>' +
    '<table class="acta-table">' +
      '<tr>' +
        '<th>Punto de Servicio:</th><td>' + (t.puntoServicio || "N/A") + '</td>' +
        '<th>Tipo de Ticket:</th><td>' + (t.tipoTicket || t.area || "N/A") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Solicitante:</th><td>' + (t.nombreUsuario || "N/A") + '</td>' +
        '<th>Cédula Solicitante:</th><td>' + (t.cedulaSolicitante || "N/A") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Correo Contacto:</th><td>' + (t.emailSolicitante || "N/A") + '</td>' +
        '<th>Teléfono Solicitante:</th><td><strong>' + (t.celularSolicitante || "N/A") + '</strong></td>' +
      '</tr>' +
      '<tr>' +
        '<th>Tipo de Servicio:</th><td>' + (t.tipoServicio || "N/A") + '</td>' +
        '<th>Fecha Solicitud:</th><td>' + fechaSol + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Nivel de Servicio:</th><td>' + (t.nivelServicio || "MEDIO") + '</td>' +
        '<th>Placa Activo Fijo:</th><td><strong>' + (t.placa || "N/A") + '</strong></td>' +
      '</tr>' +
      '<tr>' +
        '<th>Equipo Intervenido:</th><td colspan="3">' + (t.descripcionEquipo || "No especificado") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Descripción Solicitud:</th><td colspan="3">' + (t.descripcionSolicitud || "Sin descripción") + '</td>' +
      '</tr>' +
    '</table>' +

    '<div class="acta-section-title">2. GESTIÓN Y ASIGNACIÓN</div>' +
    '<table class="acta-table">' +
      '<tr>' +
        '<th>Técnico Responsable:</th><td>' + tecnicoNombre + '</td>' +
        '<th>Cédula Técnico:</th><td>' + tecnicoCedula + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Teléfono Técnico:</th><td>' + (t.celularResponsable || "N/A") + '</td>' +
        '<th>Fecha Asignación:</th><td>' + fechaAsig + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Fecha Programada / Visita:</th><td>' + fechaVis + '</td>' +
        '<th>Asunto / Técnica:</th><td>' + (t.tecnicaMantenimiento || "Correctivo en sitio") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Observaciones Asignación:</th><td colspan="3">' + (t.observacionesAsignacion || "Sin observaciones") + '</td>' +
      '</tr>' +
    '</table>' +

    '<div class="acta-section-title">3. CIERRE DEL SERVICIO Y RESULTADOS</div>' +
    '<table class="acta-table">' +
      '<tr>' +
        '<th>Fecha de Terminación:</th><td>' + fechaCie + '</td>' +
        '<th>Estado Final:</th><td><strong>' + (t.estado || "CERRADO") + '</strong></td>' +
      '</tr>' +
      '<tr>' +
        '<th>Tipo de Falla:</th><td>' + (t.tipoFalla || "No especificada") + '</td>' +
        '<th>Repuestos / Insumos:</th><td>' + (t.repuesto || "Ninguno") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>¿Equipo en Funcionamiento?:</th><td colspan="3">' + estadoOperativoHtml + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Trabajo Realizado / Avance:</th><td colspan="3" style="white-space: pre-wrap;">' + (t.respuesta || "Trabajo finalizado a conformidad y satisfacción del solicitante.") + '</td>' +
      '</tr>' +
      '<tr>' +
        '<th>Recibido Por (En Sitio):</th><td>' + receptorNombre + '</td>' +
        '<th>Cédula Quien Recibe:</th><td>' + receptorCedula + '</td>' +
      '</tr>' +
    '</table>' +

    evidenciasHtml +

    '<table class="acta-signatures-table">' +
      '<tr>' +
        '<td>' +
          '<div class="acta-sign-box">' +
            '<strong>' + tecnicoNombre.toUpperCase() + '</strong><br>' +
            'C.C. ' + tecnicoCedula + '<br>' +
            '<span style="font-size: 0.76rem; color: #64748b;">Técnico Responsable Asignado</span>' +
          '</div>' +
        '</td>' +
        '<td>' +
          '<div class="acta-sign-box">' +
            '<strong>' + receptorNombre.toUpperCase() + '</strong><br>' +
            'C.C. ' + receptorCedula + '<br>' +
            '<span style="font-size: 0.76rem; color: #64748b;">Solicitante / Responsable de Punto</span>' +
          '</div>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    '<div class="acta-footer-doc">' +
      'Documento oficial generado automáticamente por el Sistema de Mesa de Ayuda de Dialimentos S.A.S. &bull; ' + fechaEmision +
    '</div>';

  var wrapper = document.getElementById("actaDocumentoWrapper");
  if (wrapper) {
    wrapper.innerHTML = actaHtml;
  }

  abrirModal("modalActaTicket");
}

/**
 * Descarga el acta del ticket en formato PDF de alta fidelidad
 * Compatible con escritorio, tablets y teléfonos móviles
 */
function descargarActaPdf() {
  var sourceEl = document.getElementById("actaDocumentoWrapper");
  if (!sourceEl) {
    mostrarToast("No se encontró el contenido del acta para exportar.", "danger");
    return;
  }

  var nroTicket = (AppState.activeActaTicket && AppState.activeActaTicket.nroTicket) || "Ticket";
  var btn = document.getElementById("btnDescargarPdfActa");
  var txtOriginal = btn ? btn.innerHTML : "";
  if (btn) {
    btn.innerHTML = '<span class="spinner-btn"></span> Generando PDF...';
    btn.disabled = true;
  }

  // Clonar para garantizar proporciones perfectas A4 incluso en teléfonos móviles
  var clone = sourceEl.cloneNode(true);
  clone.id = "actaPdfExportClone";
  clone.classList.add("acta-pdf-print-mode");
  clone.style.width = "780px";
  clone.style.maxWidth = "780px";
  clone.style.margin = "0";
  clone.style.padding = "24px 28px";
  clone.style.background = "#ffffff";
  clone.style.position = "fixed";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.zIndex = "-1000";
  document.body.appendChild(clone);

  var opt = {
    margin: [8, 8, 8, 8],
    filename: "Acta_" + nroTicket + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 800
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
  };

  function limpiarBoton() {
    if (btn) {
      btn.innerHTML = txtOriginal;
      btn.disabled = false;
    }
    if (document.getElementById("actaPdfExportClone")) {
      document.body.removeChild(clone);
    }
  }

  if (typeof html2pdf !== "undefined") {
    html2pdf().set(opt).from(clone).save()
      .then(function() {
        limpiarBoton();
        mostrarToast("Acta " + nroTicket + " descargada con éxito en PDF.", "success");
      })
      .catch(function(err) {
        console.error("Error al exportar PDF con html2pdf:", err);
        limpiarBoton();
        imprimirActa();
      });
  } else {
    limpiarBoton();
    imprimirActa();
  }
}

/**
 * Abre el diálogo de impresión / Guardar como PDF nativo del navegador
 */
function imprimirActa() {
  window.print();
}

window.verActaTicket = verActaTicket;
window.descargarActaPdf = descargarActaPdf;
window.imprimirActa = imprimirActa;