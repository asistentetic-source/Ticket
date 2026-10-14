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
  if (selPunto) {
    selPunto.innerHTML = '<option value="">Seleccione Punto de Servicio...</option>';
    AppState.catalogos.puntos.forEach(p => {
      const nombre = p.nombre || p["NOMBRE"] || p["PUNTO DE SERVICIO"] || p["PUNTO"] || p["DESCRIPCION"] || "";
      const codigo = p.codigo || p["CODIGO"] || p["CÓDIGO"] || p["COD"] || "";
      const label = codigo ? `${nombre} (${codigo})` : nombre;
      if (nombre && nombre !== "undefined") {
        selPunto.innerHTML += `<option value="${nombre}">${label}</option>`;
      }
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
// 2. AUTENTICACIÓN Y SESIÓN
// ============================================================================
function verificarSesion() {
  const sesionGuardada = localStorage.getItem("DIALIMENTOS_USER");
  if (sesionGuardada) {
    try {
      AppState.currentUser = JSON.parse(sesionGuardada);
      mostrarAppPrincipal();
      return;
    } catch (e) {
      localStorage.removeItem("DIALIMENTOS_USER");
    }
  }
  // Si no hay sesión, mostrar pantalla de login
  document.getElementById("loginView").style.display = "flex";
  document.getElementById("mainAppView").style.display = "none";
}

function ejecutarLogin(cedulaManual) {
  const cedulaInput = cedulaManual || document.getElementById("cedulaInput").value.trim();
  if (!cedulaInput) {
    mostrarAlerta("Ingrese un número de cédula válido", "warning");
    return;
  }

  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) btnLogin.disabled = true;

  const callback = function (res) {
    if (btnLogin) btnLogin.disabled = false;
    if (res.success) {
      AppState.currentUser = res.user;
      localStorage.setItem("DIALIMENTOS_USER", JSON.stringify(res.user));
      mostrarAppPrincipal();
    } else if (res.esAdmin || res.requierePassword) {
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
      mostrarAlerta(res.message || "Cédula no encontrada en el registro de empleados", "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        if (btnLogin) btnLogin.disabled = false;
        mostrarAlerta("Error de autenticación: " + err, "danger");
      })
      .login(cedulaInput);
  } else {
    llamarApiBackend("login", { cedula: cedulaInput }).then(callback);
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
  const cedulaInput = document.getElementById("cedulaInput");
  if (cedulaInput) {
    cedulaInput.focus();
    cedulaInput.select();
  }
}

function cerrarSesion() {
  localStorage.removeItem("DIALIMENTOS_USER");
  AppState.currentUser = null;
  AppState.pendingAdminUser = null;
  AppState.filtros.area = "TODAS";
  AppState.filtros.estado = "TODOS";
  AppState.filtros.busqueda = "";
  const selArea = document.getElementById("filtroArea");
  if (selArea) {
    selArea.disabled = false;
    selArea.value = "TODAS";
    selArea.style.cursor = "default";
    selArea.style.opacity = "1";
    selArea.removeAttribute("title");
  }
  volverALoginCedula();
  document.getElementById("loginView").style.display = "flex";
  document.getElementById("mainAppView").style.display = "none";
}

function toggleAdminLogin(mostrarAdmin) {
  if (mostrarAdmin) {
    // Si se invoca, no hacer nada o simplemente enfocar cédula
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
  if (btnAdmin) btnAdmin.disabled = true;

  const cedula = AppState.pendingAdminUser.cedula;
  const area = AppState.pendingAdminUser.area || "";

  const callback = function (res) {
    if (btnAdmin) btnAdmin.disabled = false;
    if (res.success) {
      AppState.currentUser = res.user;
      localStorage.setItem("DIALIMENTOS_USER", JSON.stringify(res.user));
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
        if (btnAdmin) btnAdmin.disabled = false;
        mostrarAlerta("Error de autenticación: " + err, "danger");
      })
      .loginAdmin(cedula, password, area);
  } else {
    llamarApiBackend("loginAdmin", { cedula: cedula, password: password, area: area }).then(callback);
  }
}

function mostrarAppPrincipal() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("mainAppView").style.display = "block";

  // Mostrar datos del usuario activo
  document.getElementById("headerUserName").textContent = AppState.currentUser.nombres;
  document.getElementById("headerUserRole").textContent = AppState.currentUser.tipoUsuario;
  document.getElementById("headerUserInitial").textContent = AppState.currentUser.nombres.charAt(0);

  // Ajustar permisos visuales según rol y área
  const esAdmin = AppState.currentUser.tipoUsuario.toLowerCase().includes("administrador");
  const esAdministradora = AppState.currentUser.tipoUsuario.toLowerCase() === "administradora";
  const esTecnico = AppState.currentUser.tipoUsuario.toLowerCase().includes("tecnico") || AppState.currentUser.tipoUsuario.toLowerCase().includes("técnico");
  const esReclutador = AppState.currentUser.tipoUsuario.toLowerCase().includes("reclutador");
  const areaUser = normalizarArea(AppState.currentUser.area);

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
  } else if ((esAdmin || esTecnico) && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
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

  // Mostrar panel de acciones RRHH solo para Reclutador o Administrador de RRHH
  const rrhhContainer = document.getElementById("rrhhActionsContainer");
  if (rrhhContainer) {
    rrhhContainer.style.display = (esReclutador || (esAdmin && areaUser === "RRHH")) ? "flex" : "none";
  }

  cargarTickets();
}

// ============================================================================
// 3. GESTIÓN Y LISTADO DE TICKETS
// ============================================================================
function cargarTickets() {
  const filtros = { ...AppState.filtros };

  // Empleado y Reclutador: solo ven sus propios tickets
  const rol = String(AppState.currentUser.tipoUsuario || "").toLowerCase();
  const esAdministradora = rol === "administradora";
  const soloPropio = rol === 'empleado' || rol === 'reclutador';
  if (soloPropio) {
    filtros.cedulaSolicitante = AppState.currentUser.cedula;
  }

  // Administradora: ve TODOS los tickets de Mantenimiento
  if (esAdministradora) {
    filtros.area = "Mantenimiento";
    delete filtros.cedulaSolicitante;
    delete filtros.cedulaResponsable;
    filtros.userRole = AppState.currentUser.tipoUsuario;
    filtros.userArea = AppState.currentUser.area;
  } else {
    // Administrador o Técnico: restringir estrictamente a los casos de su área asignada
    const esAdmin = rol.includes("administrador");
    const esTecnico = rol.includes("tecnico") || rol.includes("técnico");
    const areaUser = normalizarArea(AppState.currentUser.area);
    if ((esAdmin || esTecnico) && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
      filtros.area = areaUser === "TIC" ? "TIC" : "Mantenimiento";
    }
    filtros.userArea = normalizarArea(AppState.currentUser.area);
    filtros.userRole = AppState.currentUser.tipoUsuario;
    filtros.userCedula = AppState.currentUser.cedula;
  }

  const callback = function (res) {
    // Protección: GAS puede retornar null si el servidor lanza una excepción no capturada
    if (!res) {
      mostrarAlerta("Error del servidor al cargar tickets. Revisa los permisos o el script en GAS.", "danger");
      console.error("obtenerTickets devolvió null — posible error interno en el servidor GAS.");
      return;
    }
    if (res.success) {
      // Blindaje local: asegurar que administradores y técnicos solo almacenen y contabilicen tickets de su área
      // Excepción: Administradora siempre ve todos los de Mantenimiento
      const r = String(AppState.currentUser.tipoUsuario || "").toLowerCase();
      const esAdm = r.includes("administrador");
      const esTec = r.includes("tecnico") || r.includes("técnico");
      const esAdministradora = r === "administradora";
      const aUser = normalizarArea(AppState.currentUser.area);

      if (esAdministradora) {
        // Administradora: todos los tickets de Mantenimiento
        AppState.tickets = (res.tickets || []).filter(t => normalizarArea(t.area) === "MANTENIMIENTO");
      } else if ((esAdm || esTec) && (aUser === "TIC" || aUser === "MANTENIMIENTO")) {
        AppState.tickets = (res.tickets || []).filter(t => normalizarArea(t.area) === aUser);
      } else {
        AppState.tickets = res.tickets || [];
      }

      renderizarKPIs();
      renderizarTablaTickets();
    } else {
      mostrarAlerta("Error cargando tickets: " + res.message, "danger");
    }
  };

  if (AppState.isGAS) {
    google.script.run
      .withSuccessHandler(callback)
      .withFailureHandler(function (err) {
        console.error("FailureHandler obtenerTickets:", err);
        mostrarAlerta("Fallo al obtener tickets: " + (err.message || err), "danger");
      })
      .obtenerTickets(filtros);
  } else {
    llamarApiBackend("obtenerTickets", { filtros: filtros }).then(callback);
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

  const esAdmin = AppState.currentUser.tipoUsuario.toLowerCase().includes("administrador");
  const esAdministradora = AppState.currentUser.tipoUsuario.toLowerCase() === "administradora";
  const esTecnico = AppState.currentUser.tipoUsuario.toLowerCase().includes("tecnico") || AppState.currentUser.tipoUsuario.toLowerCase().includes("técnico");
  const esReclutador = AppState.currentUser.tipoUsuario.toLowerCase().includes("reclutador");
  const areaUser = normalizarArea(AppState.currentUser.area);

  const ticketsAMostrar = AppState.tickets.filter(t => {
    if (esAdministradora) {
      return normalizarArea(t.area) === "MANTENIMIENTO";
    }
    if ((esAdmin || esTecnico) && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
      return normalizarArea(t.area) === areaUser;
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
    
    // Botones de acción contextuales según rol y estado
    let botonesAccion = `<button class="btn btn-secondary btn-sm" onclick="verDetalleTicket('${t.nroTicket}')">Ver</button>`;

    if (esAdmin && esMismaArea && t.estado.toUpperCase() === "ABIERTO") {
      botonesAccion += ` <button class="btn btn-primary btn-sm" onclick="abrirModalAsignar('${t.nroTicket}')">Asignar</button>`;
    }

    if ((esTecnico || esAdmin) && esMismaArea && (t.estado.toUpperCase() === "PROCESO" || t.estado.toUpperCase() === "PENDIENTE")) {
      const esPend = t.estado.toUpperCase() === "PENDIENTE";
      const txtBtn = esPend ? "Reanudar / Gestionar" : "Cerrar";
      const clsBtn = esPend ? "btn-warning" : "btn-success";
      botonesAccion += ` <button class="btn ${clsBtn} btn-sm" onclick="abrirModalCierre('${t.nroTicket}')">${txtBtn}</button>`;
    }

    // Botón exclusivo para la Administradora
    if (esAdministradora) {
      botonesAccion += ` <button class="btn btn-sm" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.5); color: #fbbf24; font-weight: 600;" onclick="abrirModalAdministradora('${t.nroTicket}')">💼 Gestionar</button>`;
    }

    return `
      <tr>
        <td>
          <span class="ticket-code">${t.nroTicket}</span><br>
          <small style="color: var(--text-dim); font-size: 0.78rem;">${formatearFechaHoraCO(t.fechaIngreso)}</small>
        </td>
        <td><span class="badge-tag ${areaClass}">${t.area}</span></td>
        <td><strong>${t.tipoServicio}</strong><br><small style="color: var(--text-dim);">${t.puntoServicio}</small></td>
        <td>
          <div style="font-weight: 500;">${t.descripcionEquipo || 'Sin equipo'}</div>
          <span class="badge-plate" style="font-size: 0.72rem; cursor: pointer;" title="Clic para modificar placa" onclick="abrirModalEditarPlaca('${t.nroTicket}', '${t.placa}')">${t.placa || 'Sin Placa'} ✏️</span>
        </td>
        <td style="max-width: 220px; white-space: normal; line-height: 1.35;">
          ${t.descripcionSolicitud}
          ${t.fotoSolicitudUrl ? `<br><span class="badge-evidence" onclick="verFotoTicket('${t.nroTicket}', '${t.fotoSolicitudUrl}', 'Solicitud')" title="Ver evidencia fotográfica adjunta">📷 Evidencia</span>` : ''}
          ${t.fotoCierreUrl ? ` <span class="badge-evidence badge-evidence-cierre" onclick="verFotoTicket('${t.nroTicket}', '${t.fotoCierreUrl}', 'Cierre')" title="Ver foto del trabajo finalizado">📸 Foto Cierre</span>` : ''}
        </td>
        <td>
          ${t.responsable || '<span style="color: var(--text-dim);">Sin Asignar</span>'}
          ${esAdministradora && t.proveedor ? `<br><small style="color: #cbd5e1; font-size: 0.74rem;">🏭 ${t.proveedor}</small>` : ''}
        </td>
        <td>
          <span class="badge-tag ${estadoClass}">${t.estado}</span>
          ${esAdministradora && t.aprobacion ? `<br><span style="display: inline-block; margin-top: 4px; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: rgba(245,158,11,0.18); color: #fbbf24; border: 1px solid rgba(245,158,11,0.35); font-weight: 500;">📋 ${t.aprobacion}</span>` : ''}
          ${esAdministradora && t.costo ? `<br><span style="display: inline-block; margin-top: 2px; font-size: 0.72rem; padding: 1px 5px; border-radius: 4px; background: rgba(16,185,129,0.18); color: #34d399; font-weight: 600;">💰 ${t.costo}</span>` : ''}
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
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
  const esAdmin = rol.includes("administrador");
  const esTecnico = rol.includes("tecnico") || rol.includes("técnico");
  const areaUser = normalizarArea(AppState.currentUser && AppState.currentUser.area);

  if (esAdministradora) {
    AppState.filtros.area = "Mantenimiento";
  } else if ((esAdmin || esTecnico) && (areaUser === "TIC" || areaUser === "MANTENIMIENTO")) {
    AppState.filtros.area = areaUser === "TIC" ? "TIC" : "Mantenimiento";
  } else {
    AppState.filtros.area = document.getElementById("filtroArea").value;
  }
  AppState.filtros.estado = document.getElementById("filtroEstado").value;
  AppState.filtros.busqueda = document.getElementById("buscarInput").value;
  cargarTickets();
}

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
  const esAdmOAdmin = rolUserActivo === "administradora" || rolUserActivo.includes("administrador");

  if (cardAdmin) {
    if (tieneDatosAdmin || esAdmOAdmin) {
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
    btnAdminContainer.style.display = (rolUserActivo === "administradora") ? "block" : "none";
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
  const datos = {
    cedula: document.getElementById('empCedula').value.trim(),
    nombres: document.getElementById('empNombres').value.trim().toUpperCase(),
    email: document.getElementById('empEmail').value.trim(),
    celular: document.getElementById('empCelular').value.trim(),
    tipoUsuario: document.getElementById('empTipoUsuario').value,
    area: document.getElementById('empArea').value.trim().toUpperCase()
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
            area: String(row[5] || 'OPERACIONES').trim().toUpperCase() || 'OPERACIONES'
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
        area: (cols[5] || 'OPERACIONES').toUpperCase()
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
    const headers = ['CEDULA', 'NOMBRES APELLIDOS', 'EMAIL', 'CELULAR', 'TIPO USUARIO', 'AREA'];
    const ejemplos = [
      ['1022922805', 'JUAN DAVID PINEDA', 'jdpineda@dialimentos.com.co', '3118019926', 'Empleado', 'OPERACIONES']
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...ejemplos]);
    // Ancho de columnas
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 16 }];
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
    return `${fecha} <span style="color: #38bdf8; font-weight: 600;">${hora}</span>`;
  }
  // Formato ISO "yyyy-MM-ddTHH:mm:ss..."
  if (s.indexOf("T") !== -1) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const fecha = d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
        const hora = d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true });
        return `${fecha} <span style="color: #38bdf8; font-weight: 600;">${hora}</span>`;
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