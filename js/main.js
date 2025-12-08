if (sessionStorage.getItem("auth") !== "true") {
    window.location.href = "./login.html";
}

const API_KEY = "AIzaSyAVEahQPxCQuPAoFTHgwi5tQSQjG-bhTUQ";
const ROOT_FOLDER = "1awfaanWwCbdTrYLxRYq1WNqEpE5pMiR3";

let ALL_FOLDER_IDS = [];
let ALL_IMAGES = [];

const loadingModal = new bootstrap.Modal(document.getElementById("loadingModal"));

function saveImagesToLocalStorage() {
    localStorage.setItem("IMAGES_CACHE", JSON.stringify(ALL_IMAGES));
    localStorage.setItem("FOLDERS_CACHE", JSON.stringify(ALL_FOLDER_IDS));
    localStorage.setItem("LAST_UPDATE", new Date().toISOString());
}

function loadImagesFromLocalStorage() {
    const imgs = localStorage.getItem("IMAGES_CACHE");
    const folders = localStorage.getItem("FOLDERS_CACHE");

    if (!imgs || !folders) return false;

    ALL_IMAGES = JSON.parse(imgs);
    ALL_FOLDER_IDS = JSON.parse(folders);
    return true;
}


async function getAllFolders(folderId) {
    let folders = new Set([folderId]);

    async function scan(id) {
        const query = `'${id}' in parents and mimeType='application/vnd.google-apps.folder'`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.files && data.files.length > 0) {
            const promises = [];
            data.files.forEach(f => {
                if (!folders.has(f.id)) {
                    folders.add(f.id);
                    promises.push(scan(f.id));
                }
            });
            await Promise.all(promises);
        }
    }

    await scan(folderId);
    return Array.from(folders);
}

async function getImagesFromFolder(folderId, modifiedAfter = null) {
    let query = `'${folderId}' in parents and mimeType contains 'image/'`;
    if (modifiedAfter) query += ` and modifiedTime > '${modifiedAfter}'`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink,webContentLink)&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    return (data.files || []).map(f => ({
        id: f.id,
        name: f.name.toLowerCase(),
        url: f.thumbnailLink ? f.thumbnailLink.replace("=s220", "=s1000") : `https://drive.google.com/uc?export=view&id=${f.id}`,
        url2: `https://drive.google.com/uc?export=view&id=${f.id}`
    }));
}

async function getImagesFromAllFolders(folderIds, batchSize = 5, modifiedAfter = null) {
    const allImages = [];
    for (let i = 0; i < folderIds.length; i += batchSize) {
        const batch = folderIds.slice(i, i + batchSize);
        const batchImgsArray = await Promise.all(batch.map(fId => getImagesFromFolder(fId, modifiedAfter)));
        allImages.push(...batchImgsArray.flat());
    }
    return allImages;
}


async function indexAllImages(force = false) {
    if (!force && loadImagesFromLocalStorage()) return;

    loadingModal.show();

    ALL_FOLDER_IDS = await getAllFolders(ROOT_FOLDER);
    ALL_IMAGES = await getImagesFromAllFolders(ALL_FOLDER_IDS, 5);

    saveImagesToLocalStorage();
    loadingModal.hide();
}


async function updateIncremental(batchSize = 5) {
    loadingModal.show();

    const loaded = loadImagesFromLocalStorage();
    const lastUpdate = localStorage.getItem("LAST_UPDATE");

    if (!loaded || !lastUpdate) {
        await indexAllImages(true);
        Swal.fire({ icon: 'success', title: 'Actualizado', text: 'Cache creada completamente', confirmButtonColor: "#00a19b" });
        return;
    }

    const currentFolders = await getAllFolders(ROOT_FOLDER);

    const newFolders = currentFolders.filter(id => !ALL_FOLDER_IDS.includes(id));
    const existingFolders = ALL_FOLDER_IDS;

    let newImages = [];

    for (let i = 0; i < newFolders.length; i += batchSize) {
        const batch = newFolders.slice(i, i + batchSize);
        const batchImgsArray = await Promise.all(batch.map(fId => getImagesFromFolder(fId)));
        newImages = newImages.concat(batchImgsArray.flat());
    }

    for (let i = 0; i < existingFolders.length; i += batchSize) {
        const batch = existingFolders.slice(i, i + batchSize);
        const batchImgsArray = await Promise.all(batch.map(async folderId => {
            const imgs = await getImagesFromFolder(folderId, lastUpdate);
            return imgs.filter(img => !ALL_IMAGES.some(e => e.id === img.id));
        }));
        newImages = newImages.concat(batchImgsArray.flat());
    }

    ALL_FOLDER_IDS = currentFolders;
    ALL_IMAGES = ALL_IMAGES.concat(newImages);
    saveImagesToLocalStorage();

    loadingModal.hide();

    Swal.fire({
        icon: "success",
        title: "Actualizado",
        text: `Se descargaron ${newImages.length} imágenes nuevas.`,
        confirmButtonColor: "#00a19b"
    });
}

function renderImages(files) {
    const container = document.getElementById("images");
    container.innerHTML = "";

    files.forEach(f => {
        container.innerHTML += `
                    <div class="col-12 col-sm-6 col-md-3">
                        <div class="card">
                            <img class="card-img-top" src="${f.url}" alt="" style="height: 10rem; object-fit:cover;">
                            <div class="card-body">
                                <p class="card-text fw-bold">${f.name}</p>
                                <a href="${f.url2}" target="_blank" class="btn btn-primary d-grid" style="color: #00a19b;">Ver imagen</a>
                            </div>
                        </div>
                    </div>
                `;
    });
}

function searchImagesLocal(text) {
    text = text.toLowerCase();
    return ALL_IMAGES.filter(img => img.name.includes(text));
}

document.getElementById("btnRefresh").addEventListener("click", () => updateIncremental(5));

document.getElementById("btnSearch").addEventListener("click", () => {
    const text = document.getElementById("search").value.trim();
    if (text.length < 2) return;
    const results = searchImagesLocal(text);
    renderImages(results);
});

document.getElementById("search").addEventListener("keyup", (event) => {
    if (event.key === "Enter") document.getElementById("btnSearch").click();
});

// Iniciar indexado al cargar
indexAllImages();

document.getElementById("search").focus();
