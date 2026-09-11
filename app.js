// ============================================================
// CONFIGURACIÓN
// ============================================================

const BAUD_RATE = 115200;

// Evita que una misma ficha sume varias vueltas
// si permanece sobre el lector.
const MIN_READ_TIME = 5000;


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

let connected = false;

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

$("btnConnect").onclick =
    connectMega;


async function connectMega() {

    if (!("serial" in navigator)) {

        alert(
            "Web Serial no está disponible.\n" +
            "Usa Google Chrome o Microsoft Edge."
        );

        return;

    }


    try {

        port =
            await navigator.serial.requestPort();


        await port.open({
            baudRate: BAUD_RATE
        });


        connected = true;

        updateSerial();

        toast("Mega 2560 conectada");


        readSerial();

    }
    catch (error) {

        console.error(error);

    }

}


async function readSerial() {

    const decoder =
        new TextDecoderStream();


    port.readable.pipeTo(
        decoder.writable
    );


    reader =
        decoder.readable.getReader();


    let buffer = "";


    try {

        while (true) {

            const {
                value,
                done
            } = await reader.read();


            if (done) break;

            if (!value) continue;


            buffer += value;


            const lines =
                buffer.split("\n");


            buffer =
                lines.pop();


            lines.forEach(line =>
                processSerial(
                    line.trim()
                )
            );

        }

    }
    catch (error) {

        console.error(error);

    }
    finally {

        connected = false;

        updateSerial();

    }

}


function processSerial(line) {

    if (!line.startsWith("RFID|"))
        return;


    const uid =
        normalizeUID(
            line.split("|")[1]
        );


    if (!uid)
        return;


    pulseScanner();


    // Captura para registrar equipo

    if (captureMode) {

        $("teamUID").value =
            uid;


        $("captureMessage").textContent =
            `Ficha detectada: ${uid}`;


        captureMode = false;

        $("btnReadUID").textContent =
            "Leer ficha";


        return;

    }


    processLap(uid);

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


        setAlert(
            "Lectura repetida ignorada.",
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


    if (!name || !uid || members < 1) {

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
                t => t.id === id
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
            t => t.id === id
        );


    if (!team)
        return;


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
            t => t.id === id
        );


    if (!team)
        return;


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
            t => t.id !== id
        );


    laps =
        laps.filter(
            l => l.teamId !== id
        );


    save();

    render();

    toast(
        "Equipo eliminado"
    );

};


// ============================================================
// FORM
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

    captureMode = false;

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

    const container =
        $("teamsGrid");


    if (!teams.length) {

        container.innerHTML =
            `<p class="empty">
                No hay equipos registrados.
            </p>`;

        return;

    }


    container.innerHTML =
        teams.map(
            (team, index) => {

                const total =
                    laps.filter(
                        l =>
                            l.teamId === team.id
                    ).length;


                return `

                    <article class="team-card">

                        <div class="team-index">
                            ${index + 1}
                        </div>

                        <h3>
                            ${escapeHTML(team.name)}
                        </h3>

                        <code>
                            UID: ${escapeHTML(team.uid)}
                        </code>

                        <div class="team-data">

                            <div>
                                <span>
                                    Integrantes
                                </span>

                                <strong>
                                    ${team.members}
                                </strong>
                            </div>

                            <div>
                                <span>
                                    Vueltas
                                </span>

                                <strong>
                                    ${total}
                                </strong>
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

                    laps:
                        laps.filter(
                            l =>
                                l.teamId ===
                                team.id
                        ).length

                })
            )
            .sort(
                (a,b) =>
                    b.laps - a.laps
            );


    if (!ranking.length) {

        $("ranking").innerHTML =
            `<p style="color:#8594aa">
                No hay equipos registrados.
            </p>`;

        $("leaderName").textContent =
            "-";

        return;

    }


    $("leaderName").textContent =
        ranking[0].name;


    $("ranking").innerHTML =
        ranking.map(
            (team,index) => `

                <div class="rank-row">

                    <div class="rank-position">
                        ${index + 1}
                    </div>

                    <div>
                        <h4>
                            ${escapeHTML(team.name)}
                        </h4>

                        <small>
                            ${team.members} integrantes
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


// ============================================================
// TABLAS
// ============================================================

function renderTables() {

    const ordered =
        [...laps]
            .sort(
                (a,b) =>
                    b.timestamp -
                    a.timestamp
            );


    $("recentTable").innerHTML =
        ordered
            .slice(0,8)
            .map(
                lap => `
                    <tr>
                        <td>${escapeHTML(lap.teamName)}</td>
                        <td>${lap.uid}</td>
                        <td>${lap.lap}</td>
                        <td>${lap.time}</td>
                        <td>${formatDuration(lap.lapTime)}</td>
                    </tr>
                `
            )
            .join("");


    $("historyTable").innerHTML =
        ordered
            .map(
                (lap,index) => `
                    <tr>
                        <td>${ordered.length-index}</td>
                        <td>${escapeHTML(lap.teamName)}</td>
                        <td>${lap.uid}</td>
                        <td>${lap.lap}</td>
                        <td>${lap.date}</td>
                        <td>${lap.time}</td>
                        <td>${formatDuration(lap.lapTime)}</td>
                    </tr>
                `
            )
            .join("");

}


// ============================================================
// STATS
// ============================================================

function renderStats() {

    $("totalTeams").textContent =
        teams.length;


    $("totalMembers").textContent =
        teams.reduce(
            (total,team) =>
                total + Number(team.members),
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
            "UID",
            "Vuelta",
            "Fecha",
            "Hora",
            "Tiempo"
        ],

        ...laps.map(
            lap => [

                lap.teamName,
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
                    row.join(",")
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


    link.click();


    URL.revokeObjectURL(url);

};


// ============================================================
// HELPERS
// ============================================================

function normalizeUID(uid = "") {

    return uid
        .replace(
            /[^a-fA-F0-9]/g,
            ""
        )
        .toUpperCase();

}


function formatDuration(ms) {

    if (!ms)
        return "-";


    const seconds =
        Math.floor(ms / 1000);


    const minutes =
        Math.floor(
            seconds / 60
        );


    const remaining =
        seconds % 60;


    return (
        String(minutes)
            .padStart(2,"0")
        +
        ":"
        +
        String(remaining)
            .padStart(2,"0")
    );

}


function setAlert(text,type) {

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
            ? "Mega conectada"
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


render();