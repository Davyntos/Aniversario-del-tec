// ============================================================
// CONFIGURACIÓN
// ============================================================

const BAUD_RATE = 115200;

// Filtro anti-rebote del navegador.
// 800 ms evita dobles lecturas instantáneas sin perder vueltas rápidas.
// El Arduino ya realiza su propio control de tarjetas repetidas.
const MIN_READ_TIME = 800;


// ============================================================
// DATOS
// ============================================================

let teams =
    JSON.parse(localStorage.getItem("tec55_teams"))
    || [];

let laps =
    JSON.parse(localStorage.getItem("tec55_laps"))
    || [];

let eventRunning =
    JSON.parse(localStorage.getItem("tec55_event"))
    || false;

let port = null;
let reader = null;
let inputDone = null;

let connected = false;
let disconnecting = false;

let captureMode = false;

let lastReads = {};


// ============================================================
// ELEMENTOS
// ============================================================

const $ =
    id => document.getElementById(id);

const navButtons =
    document.querySelectorAll(".nav-btn");

const pages =
    document.querySelectorAll(".page");


// ============================================================
// NAVEGACIÓN
// ============================================================

navButtons.forEach(button => {

    button.onclick = () => {

        showPage(
            button.dataset.page
        );

    };

});


function showPage(id) {

    pages.forEach(page =>
        page.classList.toggle(
            "active",
            page.id === id
        )
    );

    navButtons.forEach(button =>
        button.classList.toggle(
            "active",
            button.dataset.page === id
        )
    );

}


// ============================================================
// GUARDAR
// ============================================================

function save() {

    localStorage.setItem(
        "tec55_teams",
        JSON.stringify(teams)
    );

    localStorage.setItem(
        "tec55_laps",
        JSON.stringify(laps)
    );

    localStorage.setItem(
        "tec55_event",
        JSON.stringify(eventRunning)
    );

}


// ============================================================
// SERIAL
// ============================================================

$("btnConnect").onclick = async () => {

    if (connected) {

        await disconnectMega();

    } else {

        await connectMega();

    }

};


// ============================================================
// CONECTAR MEGA
// ============================================================

async function connectMega() {

    if (!("serial" in navigator)) {

        alert(
            "Web Serial no está disponible.\n" +
            "Usa Google Chrome o Microsoft Edge."
        );

        return;
    }


    if (connected) {

        toast(
            "La Mega ya está conectada"
        );

        return;
    }


    try {

        let availablePorts =
            await navigator.serial.getPorts();


        // Si existe exactamente un puerto autorizado,
        // intentamos usarlo.
        if (availablePorts.length === 1) {

            port =
                availablePorts[0];

        } else {

            // Si no existe ninguno o existen varios,
            // mostramos el selector.
            port =
                await navigator.serial.requestPort();

        }


        if (!port) {

            return;

        }


        await port.open({

            baudRate: BAUD_RATE,

            dataBits: 8,

            stopBits: 1,

            parity: "none",

            flowControl: "none"

        });


        connected = true;

        disconnecting = false;


        updateSerial();


        toast(
            "Mega 2560 conectada"
        );


        console.log(
            "✅ Mega 2560 conectada correctamente"
        );


        readSerial();

    }
    catch (error) {

        connected = false;

        updateSerial();


        // ----------------------------------------------------
        // USUARIO CANCELÓ SELECCIÓN
        // ----------------------------------------------------

        if (error.name === "NotFoundError") {

            console.log(
                "⚠️ Selección de puerto cancelada."
            );


            toast(
                "No seleccionaste ningún puerto"
            );


            port = null;

            return;

        }


        // ----------------------------------------------------
        // WINDOWS NO PUDO ABRIR EL PUERTO
        // ----------------------------------------------------

        if (error.name === "NetworkError") {

            console.error(
                "❌ No se pudo abrir el puerto:",
                error
            );


            alert(
                "No se pudo abrir el puerto de la Mega.\n\n" +

                "Revisa lo siguiente:\n\n" +

                "• Cierra el Monitor Serie de Arduino IDE.\n" +

                "• Cierra el Plotter Serie.\n" +

                "• Verifica que otra aplicación no esté usando el puerto COM.\n" +

                "• Desconecta y vuelve a conectar la Mega.\n" +

                "• Revisa el puerto en Administrador de dispositivos."
            );


            port = null;

            return;

        }


        // ----------------------------------------------------
        // PUERTO YA ABIERTO
        // ----------------------------------------------------

        if (error.name === "InvalidStateError") {

            console.error(
                "❌ El puerto ya está abierto:",
                error
            );


            alert(
                "El puerto serial ya se encuentra abierto."
            );


            return;

        }


        // ----------------------------------------------------
        // PERMISOS
        // ----------------------------------------------------

        if (error.name === "SecurityError") {

            console.error(
                "❌ Acceso al puerto bloqueado:",
                error
            );


            alert(
                "El navegador bloqueó el acceso al puerto serial."
            );


            port = null;

            return;

        }


        console.error(
            "❌ Error serial:",
            error
        );


        alert(
            "Ocurrió un error al conectar la Mega:\n\n" +
            error.message
        );


        port = null;

    }

}


// ============================================================
// DESCONECTAR MEGA
// ============================================================

async function disconnectMega() {

    if (!port) {

        connected = false;

        updateSerial();

        return;

    }


    disconnecting = true;


    try {

        // ----------------------------------------------------
        // DETENER LECTOR
        // ----------------------------------------------------

        if (reader) {

            try {

                await reader.cancel();

            }
            catch (error) {

                console.warn(
                    "No fue necesario cancelar el lector.",
                    error
                );

            }

        }


        // ----------------------------------------------------
        // ESPERAR QUE TERMINE EL PIPE
        // ----------------------------------------------------

        if (inputDone) {

            try {

                await inputDone;

            }
            catch (error) {

                // Puede ocurrir normalmente cuando se cancela.

            }

        }


        // ----------------------------------------------------
        // CERRAR PUERTO
        // ----------------------------------------------------

        try {

            await port.close();

        }
        catch (error) {

            console.warn(
                "El puerto ya estaba cerrado.",
                error
            );

        }

    }
    finally {

        reader = null;

        inputDone = null;

        port = null;

        connected = false;

        disconnecting = false;


        updateSerial();


        toast(
            "Mega desconectada"
        );


        console.log(
            "🔌 Mega desconectada"
        );

    }

}


// ============================================================
// LEER SERIAL
// ============================================================

async function readSerial() {

    if (!port || !port.readable) {

        console.error(
            "❌ El puerto no está disponible para lectura."
        );

        return;

    }


    const decoder =
        new TextDecoderStream();


    inputDone =
        port.readable.pipeTo(
            decoder.writable
        );


    reader =
        decoder.readable.getReader();


    let buffer = "";


    try {

        while (connected) {

            const {
                value,
                done
            } =
                await reader.read();


            if (done) {

                break;

            }


            if (!value) {

                continue;

            }


            buffer += value;


            const lines =
                buffer.split("\n");


            buffer =
                lines.pop() || "";


            lines.forEach(line => {

                const cleanLine =
                    line.trim();


                if (!cleanLine) {

                    return;

                }


                console.log(
                    "📥 Serial:",
                    cleanLine
                );


                processSerial(
                    cleanLine
                );

            });

        }

    }
    catch (error) {

        if (!disconnecting) {

            console.error(
                "❌ Error leyendo puerto serial:",
                error
            );

        }

    }
    finally {

        try {

            reader?.releaseLock();

        }
        catch (error) {

            // El lock ya pudo haber sido liberado.

        }


        reader = null;


        if (!disconnecting) {

            connected = false;

            updateSerial();

        }

    }

}


// ============================================================
// DESCONEXIÓN FÍSICA
// ============================================================

if ("serial" in navigator) {

    navigator.serial.addEventListener(
        "disconnect",
        event => {

            if (
                port &&
                event.target === port
            ) {

                console.warn(
                    "⚠️ Mega desconectada físicamente"
                );


                connected = false;

                port = null;

                reader = null;

                inputDone = null;


                updateSerial();


                toast(
                    "Mega desconectada"
                );

            }

        }
    );

}


// ============================================================
// PROCESAR SERIAL
// ============================================================

function processSerial(line) {

    // --------------------------------------------------------
    // El programa acepta dos formatos enviados por Arduino:
    // 1) RFID|74831E03
    // 2) Codigo Tarjeta: 74831E03
    // --------------------------------------------------------

    const uid = extractUIDFromSerial(line);


    // Las demás líneas del Arduino son solo mensajes
    // informativos y se ignoran.
    if (!uid) {

        return;

    }


    console.log(
        "🏷️ UID detectado:",
        uid
    );


    pulseScanner();


    // ========================================================
    // CAPTURA PARA REGISTRAR EQUIPO
    // ========================================================

    if (captureMode) {

        $("teamUID").value =
            uid;


        $("captureMessage").textContent =
            `Ficha detectada: ${uid}`;


        $("captureMessage")
            .classList
            .add("active");


        captureMode = false;


        $("btnReadUID").textContent =
            "Leer ficha";


        toast(
            `Ficha detectada: ${uid}`
        );


        return;

    }


    // ========================================================
    // REGISTRAR VUELTA
    // ========================================================

    processLap(uid);

}


// ============================================================
// EXTRAER UID DESDE EL SERIAL
// ============================================================

function extractUIDFromSerial(line = "") {

    const cleanLine =
        String(line).trim();


    // Formato recomendado:
    // RFID|74831E03
    if (cleanLine.startsWith("RFID|")) {

        const parts =
            cleanLine.split("|");


        if (parts.length >= 2) {

            return normalizeUID(
                parts[1]
            );

        }

    }


    // Formato que actualmente está enviando tu Mega:
    // Codigo Tarjeta: 74831E03
    const cardMatch =
        cleanLine.match(
            /(?:codigo|código)\s+(?:de\s+)?tarjeta\s*:\s*([0-9a-fA-F\s:-]+)/i
        );


    if (cardMatch) {

        return normalizeUID(
            cardMatch[1]
        );

    }


    // También acepta variantes comunes:
    // UID: 74 83 1E 03
    // UID Tarjeta: 74831E03
    const uidMatch =
        cleanLine.match(
            /uid(?:\s+(?:de\s+)?tarjeta)?\s*:\s*([0-9a-fA-F\s:-]+)/i
        );


    if (uidMatch) {

        return normalizeUID(
            uidMatch[1]
        );

    }


    return "";

}


// ============================================================
// PROCESAR VUELTA
// ============================================================

function processLap(uid) {

    $("lastUID").textContent =
        `UID: ${uid}`;


    if (!eventRunning) {

        setAlert(
            "El evento está detenido.",
            "error"
        );

        return;

    }


    const team =
        teams.find(
            t =>
                normalizeUID(t.uid) === uid
        );


    if (!team) {

        $("lastTeam").textContent =
            "Ficha desconocida";


        $("lastLap").textContent =
            "-";


        setAlert(
            "La ficha no está registrada.",
            "error"
        );


        return;

    }


    const now =
        Date.now();


    if (
        lastReads[uid] &&
        now - lastReads[uid] <
        MIN_READ_TIME
    ) {

        $("lastTeam").textContent =
            team.name;


        const elapsed =
            now - lastReads[uid];


        console.log(
            `⏱️ Lectura repetida ignorada: ${uid} (${elapsed} ms)`
        );


        setAlert(
            "Lectura repetida demasiado rápida; se ignoró para evitar doble conteo.",
            "error"
        );


        return;

    }


    lastReads[uid] =
        now;


    registerLap(team);

}


// ============================================================
// REGISTRAR VUELTA
// ============================================================

function registerLap(team) {

    const teamLaps =
        laps.filter(
            l =>
                l.teamId === team.id
        );


    const previous =
        teamLaps.at(-1);


    const now =
        new Date();


    const lap = {

        id:
            crypto.randomUUID(),

        teamId:
            team.id,

        teamName:
            team.name,

        uid:
            team.uid,

        category:
            getTeamCategory(team),

        lap:
            teamLaps.length + 1,

        timestamp:
            now.getTime(),

        date:
            now.toLocaleDateString(),

        time:
            now.toLocaleTimeString(),

        lapTime:
            previous
                ? now.getTime() -
                  previous.timestamp
                : null

    };


    laps.push(lap);


    save();

    render();


    $("lastTeam").textContent =
        team.name;


    $("lastLap").textContent =
        lap.lap;


    $("lastTime").textContent =
        lap.time;


    setAlert(
        `Vuelta ${lap.lap} registrada`,
        "success"
    );


    toast(
        `${team.name} · Vuelta ${lap.lap}`
    );

}


// ============================================================
// CAPTURA UID
// ============================================================

$("btnReadUID").onclick = () => {

    if (!connected) {

        alert(
            "Primero conecta la Mega 2560."
        );

        return;

    }


    captureMode = true;


    $("captureMessage")
        .classList
        .add("active");


    $("captureMessage").textContent =
        "Acerca la ficha al lector...";


    $("btnReadUID").textContent =
        "Esperando...";

};


// ============================================================
// EQUIPOS
// ============================================================

$("teamForm").onsubmit = event => {

    event.preventDefault();


    const id =
        $("teamId").value;


    const name =
        $("teamName").value.trim();


    const members =
        Number(
            $("teamMembers").value
        );


    const uid =
        normalizeUID(
            $("teamUID").value
        );


    if (
        !name ||
        !uid ||
        members < 1
    ) {

        alert(
            "Completa correctamente los datos."
        );

        return;

    }


    const duplicate =
        teams.find(
            team =>
                normalizeUID(team.uid) === uid &&
                team.id !== id
        );


    if (duplicate) {

        alert(
            `La ficha ya pertenece a "${duplicate.name}".`
        );

        return;

    }


    if (id) {

        const team =
            teams.find(
                t =>
                    t.id === id
            );


        if (team) {

            team.name =
                name;

            team.members =
                members;

            team.uid =
                uid;


            laps
                .filter(
                    lap =>
                        lap.teamId === id
                )
                .forEach(
                    lap => {

                        lap.teamName =
                            name;

                        lap.uid =
                            uid;

                        lap.category =
                            getCategoryByMembers(members);

                    }
                );

        }


        toast(
            "Equipo actualizado"
        );

    }
    else {

        teams.push({

            id:
                crypto.randomUUID(),

            name,

            members,

            uid,

            createdAt:
                Date.now()

        });


        toast(
            "Equipo registrado"
        );

    }


    save();

    resetForm();

    render();

    showPage("equipos");

};


// ============================================================
// EDITAR
// ============================================================

window.editTeam = id => {

    const team =
        teams.find(
            t =>
                t.id === id
        );


    if (!team) {

        return;

    }


    $("teamId").value =
        team.id;


    $("teamName").value =
        team.name;


    $("teamMembers").value =
        team.members;


    $("teamUID").value =
        team.uid;


    $("formTitle").textContent =
        "Editar equipo";


    showPage("registro");

};


// ============================================================
// ELIMINAR
// ============================================================

window.deleteTeam = id => {

    const team =
        teams.find(
            t =>
                t.id === id
        );


    if (!team) {

        return;

    }


    if (
        !confirm(
            `¿Eliminar el equipo "${team.name}"?\n` +
            "También se eliminarán sus vueltas."
        )
    ) {

        return;

    }


    teams =
        teams.filter(
            t =>
                t.id !== id
        );


    laps =
        laps.filter(
            l =>
                l.teamId !== id
        );


    save();

    render();


    toast(
        "Equipo eliminado"
    );

};


// ============================================================
// FORMULARIO
// ============================================================

$("btnCancel").onclick = () => {

    resetForm();

    showPage("equipos");

};


$("btnNewTeam").onclick = () => {

    resetForm();

    showPage("registro");

};


function resetForm() {

    $("teamForm").reset();


    $("teamId").value =
        "";


    $("teamMembers").value =
        1;


    $("formTitle").textContent =
        "Registrar equipo";


    $("captureMessage")
        .classList
        .remove("active");


    $("captureMessage").textContent =
        "";


    captureMode = false;


    $("btnReadUID").textContent =
        "Leer ficha";

}


// ============================================================
// EVENTO
// ============================================================

$("btnEvent").onclick = () => {

    eventRunning =
        !eventRunning;


    save();

    updateEvent();

};


function updateEvent() {

    if (eventRunning) {

        $("eventStatus").textContent =
            "Evento en curso";


        $("eventStatus").className =
            "event-status running";


        $("btnEvent").textContent =
            "Detener evento";


        $("btnEvent").className =
            "btn danger";

    }
    else {

        $("eventStatus").textContent =
            "Evento detenido";


        $("eventStatus").className =
            "event-status stopped";


        $("btnEvent").textContent =
            "Iniciar evento";


        $("btnEvent").className =
            "btn success";

    }

}


// ============================================================
// RENDER EQUIPOS
// ============================================================

function renderTeams() {

    const individualTeams =
        teams.filter(
            team =>
                getTeamCategory(team) === "Individual"
        );


    const relayTeams =
        teams.filter(
            team =>
                getTeamCategory(team) === "Relevos"
        );


    $("individualTeamsCount").textContent =
        individualTeams.length;


    $("relayTeamsCount").textContent =
        relayTeams.length;


    renderTeamGroup(
        "individualTeamsGrid",
        individualTeams,
        "No hay participantes individuales registrados."
    );


    renderTeamGroup(
        "relayTeamsGrid",
        relayTeams,
        "No hay equipos de relevos registrados."
    );

}


function renderTeamGroup(containerId, group, emptyMessage) {

    const container =
        $(containerId);


    if (!group.length) {

        container.innerHTML =
            `<p class="empty-category">${emptyMessage}</p>`;

        return;

    }


    container.innerHTML =
        group.map(
            (team, index) => {

                const total =
                    laps.filter(
                        lap =>
                            lap.teamId === team.id
                    ).length;


                const category =
                    getTeamCategory(team);


                const categoryClass =
                    category === "Individual"
                        ? "individual"
                        : "relay";


                return `
                    <article class="team-card">
                        <div class="team-index">
                            ${index + 1}
                        </div>

                        <span class="category-badge ${categoryClass}">
                            ${category}
                        </span>

                        <h3>
                            ${escapeHTML(team.name)}
                        </h3>

                        <code>
                            UID: ${escapeHTML(team.uid)}
                        </code>

                        <div class="team-data">
                            <div>
                                <span>Integrantes</span>
                                <strong>${team.members}</strong>
                            </div>

                            <div>
                                <span>Vueltas</span>
                                <strong>${total}</strong>
                            </div>
                        </div>

                        <div class="team-actions">
                            <button
                                class="btn secondary"
                                onclick="editTeam('${team.id}')"
                            >
                                Editar
                            </button>

                            <button
                                class="btn ghost"
                                onclick="deleteTeam('${team.id}')"
                            >
                                Eliminar
                            </button>
                        </div>
                    </article>
                `;

            }
        )
        .join("");

}


// ============================================================
// RANKING
// ============================================================

function renderRanking() {

    const ranking =
        teams
            .map(
                team => ({
                    ...team,
                    category:
                        getTeamCategory(team),
                    laps:
                        laps.filter(
                            lap =>
                                lap.teamId === team.id
                        ).length,
                    lastLapTimestamp:
                        getLastLapTimestamp(team.id)
                })
            );


    const individualRanking =
        ranking
            .filter(
                team =>
                    team.category === "Individual"
            )
            .sort(compareRanking);


    const relayRanking =
        ranking
            .filter(
                team =>
                    team.category === "Relevos"
            )
            .sort(compareRanking);


    renderRankingGroup(
        "individualRanking",
        individualRanking,
        "No hay participantes individuales."
    );


    renderRankingGroup(
        "relayRanking",
        relayRanking,
        "No hay equipos de relevos."
    );


    $("leaderIndividual").textContent =
        individualRanking.length
            ? individualRanking[0].name
            : "-";


    $("leaderRelay").textContent =
        relayRanking.length
            ? relayRanking[0].name
            : "-";

}


function renderRankingGroup(containerId, ranking, emptyMessage) {

    const container =
        $(containerId);


    if (!ranking.length) {

        container.innerHTML =
            `<p class="empty-category">${emptyMessage}</p>`;

        return;

    }


    container.innerHTML =
        ranking.map(
            (team, index) => `
                <div class="rank-row">
                    <div class="rank-position">
                        ${index + 1}
                    </div>

                    <div>
                        <h4>
                            ${escapeHTML(team.name)}
                        </h4>

                        <small>
                            ${team.members} ${Number(team.members) === 1 ? "integrante" : "integrantes"}
                        </small>
                    </div>

                    <div class="rank-laps">
                        ${team.laps}
                    </div>
                </div>
            `
        )
        .join("");

}


function compareRanking(a, b) {

    if (b.laps !== a.laps) {
        return b.laps - a.laps;
    }


    // Si ambos tienen las mismas vueltas, queda arriba quien
    // completó su última vuelta primero.
    return a.lastLapTimestamp - b.lastLapTimestamp;

}


function getLastLapTimestamp(teamId) {

    const teamLaps =
        laps
            .filter(
                lap =>
                    lap.teamId === teamId
            )
            .sort(
                (a, b) =>
                    b.timestamp - a.timestamp
            );


    return teamLaps.length
        ? teamLaps[0].timestamp
        : Number.MAX_SAFE_INTEGER;

}


// ============================================================
// TABLAS
// ============================================================

function renderTables() {

    const ordered =
        [...laps]
            .sort(
                (a, b) =>
                    b.timestamp - a.timestamp
            );


    $("recentTable").innerHTML =
        ordered
            .slice(0, 8)
            .map(
                lap => {

                    const category =
                        getLapCategory(lap);


                    const categoryClass =
                        category === "Individual"
                            ? "individual"
                            : "relay";


                    return `
                        <tr>
                            <td>${escapeHTML(lap.teamName)}</td>
                            <td>
                                <span class="table-category ${categoryClass}">
                                    ${category}
                                </span>
                            </td>
                            <td>${escapeHTML(lap.uid)}</td>
                            <td>${lap.lap}</td>
                            <td>${lap.time}</td>
                            <td>${formatDuration(lap.lapTime)}</td>
                        </tr>
                    `;

                }
            )
            .join("");


    $("historyTable").innerHTML =
        ordered
            .map(
                (lap, index) => {

                    const category =
                        getLapCategory(lap);


                    const categoryClass =
                        category === "Individual"
                            ? "individual"
                            : "relay";


                    return `
                        <tr>
                            <td>${ordered.length - index}</td>
                            <td>${escapeHTML(lap.teamName)}</td>
                            <td>
                                <span class="table-category ${categoryClass}">
                                    ${category}
                                </span>
                            </td>
                            <td>${escapeHTML(lap.uid)}</td>
                            <td>${lap.lap}</td>
                            <td>${lap.date}</td>
                            <td>${lap.time}</td>
                            <td>${formatDuration(lap.lapTime)}</td>
                        </tr>
                    `;

                }
            )
            .join("");

}


// ============================================================
// ESTADÍSTICAS
// ============================================================

function renderStats() {

    $("totalTeams").textContent =
        teams.length;


    $("totalMembers").textContent =
        teams.reduce(
            (total, team) =>
                total +
                Number(team.members),
            0
        );


    $("totalLaps").textContent =
        laps.length;

}


// ============================================================
// EXPORTAR CSV
// ============================================================

$("btnExport").onclick = () => {

    if (!laps.length) {

        alert(
            "No existen vueltas para exportar."
        );

        return;

    }


    const rows = [

        [
            "Equipo",
            "Categoría",
            "UID",
            "Vuelta",
            "Fecha",
            "Hora",
            "Tiempo"
        ],

        ...laps.map(
            lap => [

                lap.teamName,

                getLapCategory(lap),

                lap.uid,

                lap.lap,

                lap.date,

                lap.time,

                formatDuration(
                    lap.lapTime
                )

            ]
        )

    ];


    const csv =
        rows
            .map(
                row =>
                    row
                        .map(value => {

                            const text =
                                String(value)
                                    .replace(/"/g, '""');


                            return `"${text}"`;

                        })
                        .join(",")
            )
            .join("\n");


    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(blob);


    const link =
        document.createElement("a");


    link.href =
        url;


    link.download =
        "vueltas_55_aniversario.csv";


    document.body.appendChild(link);


    link.click();


    link.remove();


    URL.revokeObjectURL(url);

};


// ============================================================
// HELPERS
// ============================================================

function getCategoryByMembers(members) {

    return Number(members) === 1
        ? "Individual"
        : "Relevos";

}


function getTeamCategory(team) {

    return getCategoryByMembers(
        team?.members || 1
    );

}


function getLapCategory(lap) {

    if (lap.category) {
        return lap.category;
    }


    const team =
        teams.find(
            item =>
                item.id === lap.teamId
        );


    return team
        ? getTeamCategory(team)
        : "Individual";

}


function normalizeUID(uid = "") {

    return uid
        .replace(
            /[^a-fA-F0-9]/g,
            ""
        )
        .toUpperCase();

}


function formatDuration(ms) {

    if (!ms) {

        return "-";

    }


    const seconds =
        Math.floor(
            ms / 1000
        );


    const minutes =
        Math.floor(
            seconds / 60
        );


    const remaining =
        seconds % 60;


    return (
        String(minutes)
            .padStart(
                2,
                "0"
            )
        +
        ":"
        +
        String(remaining)
            .padStart(
                2,
                "0"
            )
    );

}


function setAlert(text, type) {

    $("readAlert").textContent =
        text;


    $("readAlert").className =
        `alert ${type}`;

}


function pulseScanner() {

    $("scannerPulse")
        .classList
        .remove("active");


    void $("scannerPulse")
        .offsetWidth;


    $("scannerPulse")
        .classList
        .add("active");

}


function updateSerial() {

    $("serialText").textContent =
        connected
            ? "Mega conectada"
            : "Mega desconectada";


    $("serialDot").className =
        connected
            ? "dot online"
            : "dot offline";


    $("btnConnect").textContent =
        connected
            ? "Desconectar Mega"
            : "Conectar Mega";

}


function escapeHTML(text) {

    const div =
        document.createElement("div");


    div.textContent =
        text;


    return div.innerHTML;

}


function toast(message) {

    const element =
        $("toast");


    element.textContent =
        message;


    element.classList.add(
        "show"
    );


    setTimeout(
        () =>
            element
                .classList
                .remove("show"),
        2200
    );

}


// ============================================================
// RENDER GENERAL
// ============================================================

function render() {

    renderTeams();

    renderRanking();

    renderTables();

    renderStats();

    updateEvent();

    updateSerial();

}


// ============================================================
// INICIAR
// ============================================================

render();
