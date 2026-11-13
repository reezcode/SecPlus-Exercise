# Security+ Study Lab

Web latihan CompTIA Security+ SY0-701 dengan tema terminal, kuis, simulasi, dan flashcard yang bisa diklik atau digeser.

## Isi paket

- index.html sebagai halaman utama.
- app.js sebagai source aplikasi yang bisa diedit.
- style.css sebagai source tampilan.
- bank.json dengan 452 soal dan kunci jawaban dari lima practice test.
- media/ dengan 10 gambar pendukung soal.

Semua file aplikasi siap dilayani oleh web server static. Bank soal dimuat dari bank.json dan gambar dimuat dari media/ menggunakan path relatif.

## Jalankan di komputer sendiri

Ekstrak ZIP, buka terminal pada folder yang berisi index.html, lalu jalankan perintah berikut dengan Python 3.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Buka http://localhost:8080 di browser. Gunakan HTTP server untuk menjalankan aplikasi karena bank soal dimuat melalui fetch.

## Hosting sendiri

Upload isi ZIP ke document root hosting, misalnya public_html. index.html, app.js, style.css, bank.json, dan folder media harus berada pada tingkat folder yang sama.

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
