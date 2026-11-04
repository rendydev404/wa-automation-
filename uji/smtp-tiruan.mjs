// Server SMTP tiruan untuk uji (tanpa TLS): EHLO, AUTH PLAIN/LOGIN, MAIL, RCPT, DATA, QUIT. Email yang diterima
// dikumpulkan di `masuk` ({ user, pass, dari, ke, judul, mentah }). `tolakLogin` = jawab 535 seperti Gmail saat
// App Password salah.
import net from "node:net";

export async function mulaiSmtpTiruan({ user = "uji@gmail.test", pass = "abcdabcdabcdabcd" } = {}) {
  const masuk = [];
  const atur = { tolakLogin: false };
  const server = net.createServer((s) => {
    let sisa = "";
    let tahap = "perintah";
    let auth = null;
    let surat = { dari: "", ke: [], data: [] };
    const tulis = (t) => s.write(`${t}\r\n`);
    const cekLogin = (u, p) => {
      if (atur.tolakLogin || u !== user || p !== pass) return tulis("535 5.7.8 Username and Password not accepted");
      auth = { user: u, pass: p };
      tulis("235 2.7.0 Accepted");
    };
    tulis("220 smtp.tiruan ESMTP");
    s.on("data", (b) => {
      sisa += b.toString("utf8");
      let i;
      while ((i = sisa.indexOf("\r\n")) >= 0) {
        const baris = sisa.slice(0, i);
        sisa = sisa.slice(i + 2);
        if (tahap === "data") {
          if (baris === ".") {
            tahap = "perintah";
            const mentah = surat.data.join("\r\n");
            masuk.push({ ...auth, dari: surat.dari, ke: surat.ke, judul: mentah.match(/^Subject: (.*)$/m)?.[1] ?? "", mentah });
            surat = { dari: "", ke: [], data: [] };
            tulis("250 2.0.0 OK");
          } else surat.data.push(baris.startsWith("..") ? baris.slice(1) : baris);
          continue;
        }
        if (tahap === "login-user") {
          tahap = "login-pass";
          auth = { user: Buffer.from(baris, "base64").toString() };
          tulis("334 UGFzc3dvcmQ6");
          continue;
        }
        if (tahap === "login-pass") {
          tahap = "perintah";
          cekLogin(auth.user, Buffer.from(baris, "base64").toString());
          continue;
        }
        const [cmd, ...arg] = baris.split(" ");
        switch (cmd.toUpperCase()) {
          case "EHLO":
            s.write("250-smtp.tiruan\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            break;
          case "AUTH":
            if (arg[0]?.toUpperCase() === "PLAIN") {
              const [, u, p] = Buffer.from(arg[1] ?? "", "base64").toString().split("\0");
              cekLogin(u, p);
            } else {
              tahap = "login-user";
              tulis("334 VXNlcm5hbWU6");
            }
            break;
          case "MAIL":
            surat.dari = baris.match(/<([^>]*)>/)?.[1] ?? "";
            tulis(auth ? "250 OK" : "530 Authentication required");
            break;
          case "RCPT":
            surat.ke.push(baris.match(/<([^>]*)>/)?.[1] ?? "");
            tulis("250 OK");
            break;
          case "DATA":
            tahap = "data";
            tulis("354 Go ahead");
            break;
          case "QUIT":
            tulis("221 Bye");
            s.end();
            break;
          default:
            tulis("250 OK");
        }
      }
    });
    s.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, user, pass, masuk, atur, berhenti: () => new Promise((r) => server.close(r)) };
}
