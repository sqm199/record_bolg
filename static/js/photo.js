(function () {
  'use strict';

  let currentKeyID = null;
  let lightboxModal = null;
  let deleteModal = null;

  // ── Upload ────────────────────────────────────────────────────────────────
  document.getElementById('uploadForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const btn     = document.getElementById('uploadBtn');
    const errorEl = document.getElementById('uploadError');

    btn.disabled     = true;
    btn.textContent  = '上传中…';
    errorEl.style.display = 'none';

    fetch('/upload_file', { method: 'POST', body: new FormData(this) })
      .then(r => r.json())
      .then(data => {
        if (data.code === 1) {
          window.location.href = '/photo';
        } else {
          errorEl.textContent    = data.msgs || '上传失败';
          errorEl.style.display  = 'block';
          btn.disabled           = false;
          btn.textContent        = '上传';
        }
      })
      .catch(() => {
        errorEl.textContent   = '网络错误，请重试';
        errorEl.style.display = 'block';
        btn.disabled          = false;
        btn.textContent       = '上传';
      });
  });

  // ── Lightbox ──────────────────────────────────────────────────────────────
  window.openLightbox = function (keyid, name, remark) {
    currentKeyID = keyid;
    document.getElementById('lightboxTitle').textContent  = name;
    document.getElementById('lightboxImg').src            = '/uploads/' + name;
    document.getElementById('lightboxRemark').value       = remark || '';
    document.getElementById('remarkMsg').textContent      = '';

    if (!lightboxModal) lightboxModal = new bootstrap.Modal(document.getElementById('lightboxModal'));
    lightboxModal.show();
  };

  window.saveRemark = function () {
    const remark  = document.getElementById('lightboxRemark').value;
    const msgEl   = document.getElementById('remarkMsg');

    fetch('/change_save_remark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: currentKeyID, Remark: remark })
    })
      .then(r => r.json())
      .then(data => {
        if (data.code === 1) {
          msgEl.style.color = 'var(--success)';
          msgEl.textContent = '已保存';
          const card = document.querySelector(`.photo-card[data-keyid="${currentKeyID}"]`);
          if (card) {
            card.dataset.remark = remark;
            card.querySelector('.card-remark').textContent = remark || '暂无备注';
          }
        } else {
          msgEl.style.color = 'var(--danger)';
          msgEl.textContent = data.msgs || '保存失败';
        }
      })
      .catch(() => {
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = '网络错误';
      });
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  window.confirmDelete = function (keyid) {
    currentKeyID = keyid;
    if (!deleteModal) deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    deleteModal.show();
  };

  document.getElementById('confirmDeleteBtn').addEventListener('click', function () {
    fetch('/delete_photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ KeyID: currentKeyID })
    })
      .then(r => r.json())
      .then(data => {
        if (data.code === 1) {
          deleteModal.hide();
          const card = document.querySelector(`.photo-card[data-keyid="${currentKeyID}"]`);
          if (card) card.remove();
        } else {
          alert(data.msgs || '删除失败，请重试');
        }
      })
      .catch(() => {
        alert('网络错误，请重试');
      });
  });
})();
