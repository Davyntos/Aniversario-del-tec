// ============================================================
// CONFIGURACIÓN
// ============================================================

const BAUD_RATE = 115200;

// Filtro anti-rebote del navegador.
// 800 ms evita dobles lecturas instantáneas sin perder vueltas rápidas.
// El Arduino ya realiza su propio control de tarjetas repetidas.
const MIN_READ_TIME = 800;
const TARGET_LAPS = 55;


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

let eventTiming =
    JSON.parse(localStorage.getItem("tec55_event_timing"))
    || {
        startedAt: null,
        accumulatedMs: 0
    };

if (eventRunning && !eventTiming.startedAt) {
    eventTiming.startedAt = Date.now();
}

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

    localStorage.setItem(
        "tec55_event_timing",
        JSON.stringify(eventTiming)
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


        $("lastTotalTime").textContent =
            "-";


        setAlert(
            "La ficha no está registrada.",
            "error"
        );


        return;

    }


    const teamLapCount =
        getTeamLaps(team.id).length;


    if (teamLapCount >= TARGET_LAPS) {

        $("lastTeam").textContent =
            team.name;

        $("lastLap").textContent =
            `${TARGET_LAPS}/${TARGET_LAPS}`;

        const finishData =
            getTeamFinishData(team.id);

        $("lastTotalTime").textContent =
            formatDuration(finishData.totalTime);

        setAlert(
            `${team.name} ya completó las ${TARGET_LAPS} vueltas.`,
            "success"
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
        getTeamLaps(team.id);


    if (teamLaps.length >= TARGET_LAPS) {

        setAlert(
            `${team.name} ya completó las ${TARGET_LAPS} vueltas.`,
            "success"
        );

        return;

    }


    const previous =
        teamLaps.at(-1);


    const now =
        new Date();


    const eventElapsed =
        getEventElapsedMs();


    let lapTime;


    if (!previous) {

        // Primera vuelta: tiempo desde que inició el evento.
        lapTime = eventElapsed;

    } else if (Number.isFinite(Number(previous.eventElapsed))) {

        // Vueltas nuevas: diferencia dentro del reloj activo del evento.
        lapTime = Math.max(
            0,
            eventElapsed - Number(previous.eventElapsed)
        );

    } else {

        // Compatibilidad con registros antiguos que no tenían eventElapsed.
        lapTime = Math.max(
            0,
            now.getTime() - Number(previous.timestamp || now.getTime())
        );

    }


    const previousCumulative =
        previous
            ? getLapCumulativeTime(previous)
            : 0;


    const cumulativeTime =
        previousCumulative + lapTime;


    const lapNumber =
        teamLaps.length + 1;


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
            lapNumber,

        timestamp:
            now.getTime(),

        time:
            now.toLocaleTimeString(),

        lapTime,

        cumulativeTime,

        eventElapsed

    };


    laps.push(lap);


    save();

    render();


    $("lastTeam").textContent =
        team.name;


    $("lastLap").textContent =
        `${lap.lap}/${TARGET_LAPS}`;


    $("lastTime").textContent =
        lap.time;


    $("lastTotalTime").textContent =
        formatDuration(lap.cumulativeTime);


    if (lap.lap === TARGET_LAPS) {

        const position =
            getFinishPosition(team);


        setAlert(
            `${team.name} completó las ${TARGET_LAPS} vueltas · Posición ${position}`,
            "success"
        );


        toast(
            `${team.name} llegó a la meta · Posición ${position}`
        );

    } else {

        setAlert(
            `Vuelta ${lap.lap} de ${TARGET_LAPS} registrada · Acumulado ${formatDuration(lap.cumulativeTime)}`,
            "success"
        );


        toast(
            `${team.name} · Vuelta ${lap.lap}/${TARGET_LAPS}`
        );

    }

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

    if (eventRunning) {

        eventTiming.accumulatedMs =
            getEventElapsedMs();

        eventTiming.startedAt =
            null;

        eventRunning =
            false;

    } else {

        eventTiming.startedAt =
            Date.now();

        eventRunning =
            true;

    }


    save();

    updateEvent();

};


function getEventElapsedMs() {

    const accumulated =
        Number(eventTiming?.accumulatedMs) || 0;


    if (
        eventRunning &&
        eventTiming?.startedAt
    ) {

        return accumulated +
            Math.max(
                0,
                Date.now() - Number(eventTiming.startedAt)
            );

    }


    return accumulated;

}


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
                                <strong>${Math.min(total, TARGET_LAPS)}/${TARGET_LAPS}</strong>
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

function buildRanking() {

    return teams.map(team => {

        const finishData =
            getTeamFinishData(team.id);


        return {
            ...team,
            category:
                getTeamCategory(team),
            laps:
                finishData.laps,
            finished:
                finishData.finished,
            finishTimestamp:
                finishData.finishTimestamp,
            lastLapTimestamp:
                finishData.lastLapTimestamp,
            totalTime:
                finishData.totalTime
        };

    });

}


function renderRanking() {

    const ranking =
        buildRanking();


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
            (team, index) => {

                const rowClass =
                    team.finished
                        ? "rank-row finished"
                        : "rank-row";


                const positionClass =
                    team.finished
                        ? "rank-position finished-position"
                        : "rank-position";


                const statusText =
                    team.finished
                        ? `META · ${formatDuration(team.totalTime)}`
                        : `${Math.min(team.laps, TARGET_LAPS)}/${TARGET_LAPS} · ${formatDuration(team.totalTime)}`;


                return `
                    <div class="${rowClass}">
                        <div class="${positionClass}">
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

                        <div class="rank-result">
                            <strong>
                                ${team.finished ? "55/55" : `${Math.min(team.laps, TARGET_LAPS)}/55`}
                            </strong>
                            <small class="${team.finished ? "finish-label" : ""}">
                                ${statusText}
                            </small>
                        </div>
                    </div>
                `;

            }
        )
        .join("");

}


function compareRanking(a, b) {

    // Primero van todos los que ya terminaron las 55 vueltas.
    // Entre finalizados, manda estrictamente el orden de llegada.
    if (a.finished && b.finished) {
        return a.finishTimestamp - b.finishTimestamp;
    }


    if (a.finished !== b.finished) {
        return a.finished ? -1 : 1;
    }


    // Mientras no hayan terminado, se ordenan por número de vueltas.
    if (b.laps !== a.laps) {
        return b.laps - a.laps;
    }


    // En empate temporal queda arriba quien completó su última vuelta primero.
    return a.lastLapTimestamp - b.lastLapTimestamp;

}


function getTeamLaps(teamId) {

    return laps
        .filter(
            lap =>
                lap.teamId === teamId
        )
        .sort(
            (a, b) =>
                Number(a.timestamp) - Number(b.timestamp)
        );

}


function getLapCumulativeTime(lap) {

    const stored =
        Number(lap?.cumulativeTime);


    if (Number.isFinite(stored) && stored >= 0) {
        return stored;
    }


    const teamLaps =
        getTeamLaps(lap.teamId);


    let total = 0;


    for (const item of teamLaps) {

        const lapTime =
            Number(item.lapTime);


        if (Number.isFinite(lapTime) && lapTime > 0) {
            total += lapTime;
        }


        if (item.id === lap.id) {
            break;
        }

    }


    return total;

}


function getTeamFinishData(teamId) {

    const teamLaps =
        getTeamLaps(teamId);


    const validLaps =
        teamLaps.slice(0, TARGET_LAPS);


    const finishLap =
        validLaps.length >= TARGET_LAPS
            ? validLaps[TARGET_LAPS - 1]
            : null;


    const lastLap =
        validLaps.at(-1);


    return {
        laps:
            validLaps.length,
        finished:
            Boolean(finishLap),
        finishTimestamp:
            finishLap
                ? Number(finishLap.timestamp)
                : Number.MAX_SAFE_INTEGER,
        lastLapTimestamp:
            lastLap
                ? Number(lastLap.timestamp)
                : Number.MAX_SAFE_INTEGER,
        totalTime:
            lastLap
                ? getLapCumulativeTime(lastLap)
                : 0
    };

}


function getFinishPosition(team) {

    const category =
        getTeamCategory(team);


    const finished =
        buildRanking()
            .filter(
                item =>
                    item.category === category &&
                    item.finished
            )
            .sort(compareRanking);


    const index =
        finished.findIndex(
            item =>
                item.id === team.id
        );


    return index >= 0
        ? index + 1
        : finished.length;

}


// ============================================================
// TABLAS
// ============================================================

function renderTables() {

    const ordered =
        [...laps]
            .sort(
                (a, b) =>
                    Number(b.timestamp) - Number(a.timestamp)
            );


    // El dashboard conserva únicamente las 8 lecturas más recientes.
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
                            <td>${Math.min(Number(lap.lap) || 0, TARGET_LAPS)}/${TARGET_LAPS}</td>
                            <td>${lap.time || "-"}</td>
                            <td>${formatDuration(lap.lapTime)}</td>
                            <td>${formatDuration(getLapCumulativeTime(lap))}</td>
                        </tr>
                    `;

                }
            )
            .join("");


    // HISTORIAL COMPACTO:
    // una sola fila por equipo. Cuando registra otra vuelta,
    // la fila se actualiza en lugar de agregar otra al historial.
    const compactHistory =
        getCompactHistory();


    $("historyTable").innerHTML =
        compactHistory.length
            ? compactHistory
                .map(
                    (item, index) => {

                        const categoryClass =
                            item.category === "Individual"
                                ? "individual"
                                : "relay";


                        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${escapeHTML(item.team.name)}</td>
                                <td>
                                    <span class="table-category ${categoryClass}">
                                        ${item.category}
                                    </span>
                                </td>
                                <td>${escapeHTML(item.team.uid)}</td>
                                <td>${Math.min(Number(item.latestLap.lap) || 0, TARGET_LAPS)}</td>
                                <td>${item.latestLap.time || "-"}</td>
                                <td>${formatDuration(item.latestLap.lapTime)}</td>
                                <td>${formatDuration(getLapCumulativeTime(item.latestLap))}</td>
                            </tr>
                        `;

                    }
                )
                .join("")
            : `
                <tr>
                    <td colspan="8">Aún no hay equipos con vueltas registradas.</td>
                </tr>
            `;

}


function getCompactHistory(category = null) {

    return teams
        .map(team => {

            const teamLaps =
                getTeamLaps(team.id);


            const latestLap =
                teamLaps.at(-1);


            if (!latestLap) {
                return null;
            }


            return {
                team,
                latestLap,
                category: getTeamCategory(team)
            };

        })
        .filter(Boolean)
        .filter(
            item =>
                !category || item.category === category
        )
        .sort((a, b) => {

            // En la vista general mostramos primero Individuales
            // y después Relevos. Dentro de cada categoría,
            // el equipo actualizado más recientemente aparece arriba.
            if (!category && a.category !== b.category) {
                return a.category === "Individual" ? -1 : 1;
            }


            return Number(b.latestLap.timestamp) - Number(a.latestLap.timestamp);

        });

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
        teams.reduce(
            (total, team) =>
                total + Math.min(getTeamLaps(team.id).length, TARGET_LAPS),
            0
        );

}


// ============================================================
// EXPORTAR EXCEL
// ============================================================

$("btnExport").onclick = () => {

    if (!laps.length) {

        alert(
            "No existen vueltas para exportar."
        );

        return;

    }


    if (typeof XLSX === "undefined") {

        alert(
            "No se pudo cargar la librería de Excel. Revisa tu conexión a Internet y vuelve a intentar."
        );

        return;

    }


    const workbook =
        XLSX.utils.book_new();


    // Excel compacto: una fila por equipo y una hoja por categoría.
    appendCompactHistorySheet(
        workbook,
        "Individuales",
        "Individual"
    );


    appendCompactHistorySheet(
        workbook,
        "Relevos",
        "Relevos"
    );


    XLSX.writeFile(
        workbook,
        "resultados_55_aniversario.xlsx"
    );


    toast(
        "Excel exportado correctamente"
    );

};


function appendCompactHistorySheet(workbook, sheetName, category) {

    const compactRows =
        getCompactHistory(category);


    const rows = [
        [
            "#",
            "Equipo",
            "Categoría",
            "UID",
            "Vuelta",
            "Hora",
            "Tiempo vuelta",
            "Acumulado"
        ],
        ...compactRows.map(
            (item, index) => [
                index + 1,
                item.team.name,
                item.category,
                item.team.uid,
                Math.min(Number(item.latestLap.lap) || 0, TARGET_LAPS),
                item.latestLap.time || "-",
                formatDuration(item.latestLap.lapTime),
                formatDuration(getLapCumulativeTime(item.latestLap))
            ]
        )
    ];


    const sheet =
        XLSX.utils.aoa_to_sheet(rows);


    configureSheet(
        sheet,
        [6, 24, 16, 18, 12, 14, 18, 20],
        rows.length,
        8
    );


    XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        sheetName
    );

}


function configureSheet(sheet, widths, rowCount, columnCount) {

    sheet["!cols"] =
        widths.map(wch => ({ wch }));


    if (rowCount > 0 && columnCount > 0) {

        sheet["!autofilter"] = {
            ref: `A1:${columnLetter(columnCount)}${rowCount}`
        };

    }


    sheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
        topLeftCell: "A2",
        activePane: "bottomLeft",
        state: "frozen"
    };

}


function columnLetter(number) {

    let result = "";
    let value = number;


    while (value > 0) {

        const remainder =
            (value - 1) % 26;

        result =
            String.fromCharCode(65 + remainder) + result;

        value =
            Math.floor((value - 1) / 26);

    }


    return result;

}


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

    const value =
        Number(ms);


    if (!Number.isFinite(value) || value <= 0) {
        return "-";
    }


    const totalSeconds =
        Math.floor(value / 1000);


    const hours =
        Math.floor(totalSeconds / 3600);


    const minutes =
        Math.floor((totalSeconds % 3600) / 60);


    const seconds =
        totalSeconds % 60;


    return [hours, minutes, seconds]
        .map(value =>
            String(value).padStart(2, "0")
        )
        .join(":");

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