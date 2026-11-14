# Security+ Study Lab

Web belajar CompTIA Security+ SY0-701 dengan materi lima domain, glosarium, kuis, simulasi, dan flashcard.

## Isi paket

- index.html sebagai halaman utama.
- app.js sebagai source aplikasi yang bisa diedit.
- style.css sebagai source tampilan.
- materi.html berisi materi lima domain, glosarium, dan referensi.
- bank.json dengan 452 soal, opsi, kunci, dan pembahasan dari lima practice test.
- media/ dengan 18 gambar pendukung soal dan opsi jawaban.

Semua file aplikasi siap dilayani oleh web server static. Bank soal dimuat dari bank.json dan gambar dimuat dari media/ menggunakan path relatif.

## Jalankan di komputer sendiri

Ekstrak ZIP, buka terminal pada folder yang berisi index.html, lalu jalankan perintah berikut dengan Python 3.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Buka http://localhost:8080 di browser. Gunakan HTTP server untuk menjalankan aplikasi karena bank soal dimuat melalui fetch.

## Hosting sendiri

Upload isi ZIP ke document root hosting, misalnya public_html. index.html, materi.html, app.js, style.css, bank.json, dan folder media harus berada pada tingkat folder yang sama.

Pada Nginx atau Apache, arahkan document root ke folder hasil ekstraksi dan gunakan index.html sebagai index. File juga dapat diletakkan di subfolder seperti /security-plus/.

Jika memakai Docker dan Nginx, jalankan perintah berikut dari folder hasil ekstraksi.

```sh
docker run --rm --name security-plus-study-lab -p 8080:80 -v "$PWD":/usr/share/nginx/html:ro nginx:alpine
```

Buka http://localhost:8080. Untuk menjalankan container setelah terminal ditutup, ganti --rm dengan -d --restart unless-stopped.

## Akses dan progres

Paket self-host ini terbuka bagi pengunjung yang dapat mengakses alamat hosting. Halaman login ChatGPT pada versi yang sebelumnya diterbitkan disediakan oleh hosting platform tersebut. Jika membutuhkan akses privat, atur autentikasi di web server atau reverse proxy milikmu.

Progres flashcard dan riwayat sesi tersimpan di localStorage, sesuai browser dan origin. Saat memakai domain atau port baru, progres lokal dimulai pada origin tersebut.

## Catatan bank soal

Jumlah soal per set adalah 88, 90, 90, 87, dan 97. Kolom nama dan email dari form sumber dikeluarkan dari bank latihan.

450 kunci jawaban dicocokkan dengan tampilan form. Dua jawaban berstatus inferred dan ditandai sebagai hasil analisis di aplikasi. Detail teknis pada lima soal diadaptasi untuk menjaga konteks pembelajaran defensif.

Tautan lima form sumber tersedia pada dashboard. Penomoran Q mengikuti nomor pada form sumber sehingga soal pertama tiap set dimulai dari Q3.

## Materi dan pembahasan

Pilih **Buka materi** di dashboard untuk membaca lima domain dan glosarium. Pilih **Pembahasan soal** untuk memilih practice test, membuka soal, dan melihat opsi, gambar, kunci, serta alasannya. Tautan seperti `./#pembahasan-1-q52` membuka soal tertentu langsung.

Pembahasan juga tampil setelah memeriksa jawaban di mode latihan, saat membuka sisi jawaban flashcard, dan pada review hasil sesi. Simulasi menampilkan pembahasan setelah sesi selesai.
