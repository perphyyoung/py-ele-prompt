export class ImageUploadHandler {
  constructor(uploadAreaId, inputId, options = {}) {
    this.uploadArea = document.getElementById(uploadAreaId);
    this.input = document.getElementById(inputId);
    this.onFilesSelected = options.onFilesSelected;
    this.bindDragEvents = options.bindDragEvents !== false;
  }

  bind() {
    if (!this.uploadArea || !this.input) return;

    this.uploadArea.addEventListener('click', () => this.input.click());

    this.input.addEventListener('change', (e) => {
      if (this.onFilesSelected) {
        this.onFilesSelected(e.target.files);
      }
      this.input.value = '';
    });

    if (this.bindDragEvents) {
      this.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
      });

      this.uploadArea.addEventListener('dragleave', () => {
        this.uploadArea.classList.remove('dragover');
      });

      this.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        if (this.onFilesSelected) {
          this.onFilesSelected(e.dataTransfer.files);
        }
      });
    }
  }
}