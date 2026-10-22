# OpenCLI Facebook Autopost

Đăng bài lên **trang cá nhân** hoặc **group Facebook** bằng trình duyệt đã đăng nhập trên máy của bạn. Có thể chạy trực tiếp bằng OpenCLI hoặc gửi yêu cầu qua Telegram/WhatsApp trên Hermes.

Lệnh mặc định chỉ chuẩn bị **bản nháp (dry-run)** và lưu screenshot. Chạy trực tiếp cần `--confirm true` để đăng; qua Hermes cần xem bản nháp rồi trả lời `POST`.

## Chọn cách sử dụng

| Nhu cầu | Cách chạy | Cần Hermes? |
| --- | --- | --- |
| Đăng lên trang cá nhân | `opencli facebook person-post` | Không |
| Đăng vào group | `opencli facebook group-post` | Không |
| Yêu cầu đăng qua Telegram/WhatsApp | Skill Hermes → worker → OpenCLI | Có |
| Menu WhatsApp Business Cloud API | Dịch vụ webhook riêng, hiện chỉ hỗ trợ group | Không dùng luồng skill bên dưới |

**Lộ trình:** cài OpenCLI và plugin → kết nối Browser Bridge → chọn profile → chạy dry-run. Sau khi chạy trực tiếp thành công, cài thêm Hermes nếu cần điều khiển từ chat.

## 1. Chuẩn bị

- Node.js **22.12 trở lên**, npm và Git.
- Chrome hoặc Brave với extension **OpenCLI Browser Bridge**.
- Đăng nhập Facebook thủ công trong đúng profile trình duyệt.
- Các ví dụ bên dưới dùng **OpenCLI 2.0.0**, phiên bản đã kiểm thử với profile cụ thể.
- Hermes chỉ cần thiết khi dùng Telegram/WhatsApp. Xem [hướng dẫn Telegram](docs/hermes-telegram.md) và [WhatsApp](docs/hermes-whatsapp.md).

Kiểm tra Node và npm:

```sh
node --version
npm --version
```

Worker và dry-run trang cá nhân đã được kiểm thử trên Windows. `install.sh` dành cho macOS/Linux; trên Windows dùng các lệnh cài thủ công dưới đây.

## 2. Cài dự án và OpenCLI

```sh
git clone https://github.com/pdt590/opencli-plugin-fb-autopost.git
cd opencli-plugin-fb-autopost
npm install
npm install -g @jackwener/opencli@2.0.0
opencli --version
```

Nếu đã có repo, chuyển vào thư mục hiện tại của repo trước khi chạy các lệnh còn lại. Không cần clone lần nữa.

`npm install` cài dependency của dự án; lệnh cài global giúp gọi `opencli` trực tiếp trong terminal. Nếu không cài được global, có thể dùng `npx opencli`, nhưng kiểm tra phiên bản bằng `npx opencli --version`: dependency trong `package.json` hiện ghim 1.8.3, có thể khác bản global 2.0.0.

### Cài plugin từ thư mục repo

**Windows — PowerShell:**

```powershell
opencli plugin install "file://$($PWD.Path)"
```

**macOS/Linux — Bash/Zsh:**

```sh
opencli plugin install "file://$(pwd)"
```

Kiểm tra plugin và hai lệnh:

```sh
opencli plugin list
opencli facebook person-post --help
opencli facebook group-post --help
```

Plugin có tên **`fb-autopost`**. Nếu đã cài từ repo này, kiểm tra đường dẫn trong `opencli plugin list` để chắc chắn đang dùng đúng thư mục mã nguồn.

## 3. Kết nối trình duyệt và chọn profile

1. Cài Browser Bridge theo [hướng dẫn OpenCLI](https://github.com/jackwener/OpenCLI).
2. Bật extension trong profile Chrome/Brave dùng cho Facebook.
3. Đăng nhập Facebook thủ công trong profile đó.
4. Giữ trình duyệt mở và kiểm tra kết nối:

```sh
opencli doctor
opencli profile list
```

Chọn một profile có `connected: true`. **`xmqguda9` trong các ví dụ là profile thử nghiệm; thay bằng ID/alias của bạn.** Profile OpenCLI là ngữ cảnh trình duyệt, không phải URL hay ID tài khoản Facebook.

Luôn truyền `--profile` khi có nhiều profile. Trong Facebook, chọn đúng danh tính cá nhân trước khi dùng `person-post`; lệnh này không dùng để đăng dưới danh nghĩa Page.

## 4. Chạy trực tiếp bằng OpenCLI

### A. Trang cá nhân — không cần cấu hình group

Chuẩn bị bản nháp chỉ có chữ:

```sh
opencli --profile xmqguda9 facebook person-post --caption "Bản nháp thử nghiệm, chưa đăng." --slow true --dry-run true --keep-tab true
```

Chuẩn bị caption từ file UTF-8 và ảnh trên máy:

```sh
opencli --profile xmqguda9 facebook person-post --caption-file caption.txt --images "photo1.jpg,photo2.png" --slow true --dry-run true --keep-tab true
```

Thay các tên file bằng file thật. Kết quả mong đợi là `status: dry-run-ready`, kèm `profile_url` và đường dẫn `screenshot`. Mở screenshot hoặc xem composer để kiểm tra tài khoản, caption, ảnh và đối tượng xem bài.

**Chỉ sau khi xem bản nháp**, dùng cùng nội dung và thay cờ dry-run bằng xác nhận đăng:

```sh
opencli --profile xmqguda9 facebook person-post --caption-file caption.txt --images "photo1.jpg,photo2.png" --slow true --confirm true
```

Mỗi lần gọi tạo một composer mới, không tiếp tục tab dry-run trước đó. Nếu Facebook hỏi về bản nháp cũ, đóng/bỏ bản nháp đó thủ công. Đối tượng xem bài được giữ theo Facebook; lệnh không tự đổi sang công khai.

### B. Group — dùng URL đầy đủ

Chạy dry-run với group mà bạn được phép đăng:

```sh
opencli --profile xmqguda9 facebook group-post --group-url "https://www.facebook.com/groups/<GROUP_ID>" --caption "Bản nháp thử nghiệm trong group." --slow true --dry-run true --keep-tab true
```

Thay `<GROUP_ID>` bằng ID/slug group thật. Kết quả có `group_url` thay vì `profile_url`. Muốn dùng caption file hoặc ảnh, thêm các tùy chọn giống lệnh trang cá nhân.

Sau khi kiểm tra, chạy lại cùng dữ liệu với `--confirm true` thay cho `--dry-run true`. **Không truyền cả hai cờ trong cùng một lệnh.**

### Các tùy chọn chung

| Tùy chọn | Ý nghĩa |
| --- | --- |
| `--caption "..."` | Caption nhập trực tiếp |
| `--caption-file caption.txt` | Đọc caption UTF-8; không dùng đồng thời với `--caption` |
| `--images "a.jpg,b.png"` | Tối đa 10 ảnh local: jpg, jpeg, png, webp, gif |
| `--slow true` | Nhập từng đoạn và nghỉ giữa các bước; mặc định tắt khi chạy CLI trực tiếp |
| `--dry-run true` | Chuẩn bị bản nháp, không bấm Post; đây cũng là chế độ mặc định nếu không xác nhận |
| `--keep-tab true` | Giữ tab để xem lại |
| `--confirm true` | Cho phép bấm Post một lần |
| `--screenshot-dir <dir>` | Chọn thư mục lưu screenshot |

Screenshot mặc định nằm trong `artifacts/facebook-person-post/` hoặc `artifacts/facebook-group-post/`. Chế độ chậm không bảo đảm tránh được hệ thống phát hiện bot của Facebook.

## 5. Điều khiển từ Telegram/WhatsApp bằng Hermes

### Cài hai skill

Cài Hermes theo [tài liệu chính thức](https://github.com/NousResearch/hermes-agent), cấu hình provider/model và xác nhận lệnh `hermes` chạy được. Sau đó, từ thư mục repo:

```sh
node scripts/install-hermes-skill.js --dry-run
node scripts/install-hermes-skill.js --force
hermes skills list
```

Installer cài/cập nhật hai skill:

- [`facebook-group-post`](hermes/skills/social-media/facebook-group-post/SKILL.md)
- [`facebook-person-post`](hermes/skills/social-media/facebook-person-post/SKILL.md)

Chúng nằm dưới `~/.hermes/skills/social-media/`. Installer cũng ghi `FB_AUTOPOST_REPO` vào `~/.hermes/.env`; trên Windows, `~` tương ứng thư mục người dùng. `--force` thay thế bản skill đã cài.

Chỉ cài một skill nếu cần:

```sh
node scripts/install-hermes-skill.js --skill facebook-person-post --force
```

### Nếu đăng group qua alias

Trang cá nhân không cần bước này. Với group, tạo alias `main`:

```sh
npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>" --group-alias main
```

Lệnh tạo `config/settings.json`, `config/groups.json` và cài plugin nếu cần. Đây là cấu hình local, không commit thông tin group riêng tư. Có thể dùng URL group đầy đủ trong yêu cầu thay cho alias.

### Chọn kênh chat

**Telegram:** tạo bot qua `@BotFather`, lấy numeric user ID và cấu hình người dùng được phép trong Hermes:

```sh
hermes gateway setup
hermes gateway start
hermes gateway status
```

Dùng numeric ID, không dùng username `@...`. Giữ bot token riêng tư. Xem [các bước cấu hình Telegram](docs/hermes-telegram.md).

**WhatsApp:** dùng gateway WhatsApp của Hermes và ghép nối theo hướng dẫn CLI:

```sh
hermes whatsapp
hermes gateway start
hermes gateway status
```

Xem [các bước cấu hình WhatsApp](docs/hermes-whatsapp.md). Cả hai kênh phải truy cập được repo, worker và ảnh local trên máy chạy trình duyệt.

### Gửi yêu cầu đăng trang cá nhân

Gửi cho Hermes qua bot Telegram hoặc cuộc trò chuyện WhatsApp đã cấu hình:

```text
Dùng skill facebook-person-post.
Chuẩn bị bài đăng Facebook cá nhân.
Profile trình duyệt: xmqguda9
Caption: Hôm nay mình hoàn thành một dự án mới 🌿.
NO IMAGES. Dùng chế độ nhập chậm.
Chỉ chạy dry-run và gửi lại screenshot.
```

Nếu có ảnh, đính kèm ảnh vào chat và thay `NO IMAGES` bằng “Dùng ảnh đính kèm”. Gateway phải tải ảnh về thành file local trước khi worker chạy.

### Gửi yêu cầu đăng group

```text
Dùng skill facebook-group-post.
Chuẩn bị bài đăng group main.
Profile trình duyệt: xmqguda9
Caption: Nội dung bài đăng trong group.
NO IMAGES. Dùng chế độ nhập chậm.
Chỉ chạy dry-run và gửi lại screenshot.
```

Hermes trả về caption, đích đăng, số ảnh và screenshot. Kiểm tra bản nháp rồi trả lời trong **cùng cuộc trò chuyện**:

- `POST`: đăng một lần từ nội dung vừa xem.
- `CANCEL`: hủy xác nhận; đóng/bỏ bản nháp đang mở trên Facebook thủ công.

Đổi caption, ảnh, profile hoặc đích đăng cần một dry-run mới. Skill không chấp nhận xác nhận từ cuộc trò chuyện khác, `POST` sau khi hủy, hoặc xác nhận khi chưa có dry-run thành công.

### WhatsApp Business Cloud API là luồng riêng

Gateway WhatsApp của Hermes ở trên không cần chạy dịch vụ webhook của repo. Nếu cần menu tương tác qua WhatsApp Business Cloud API, dùng [hướng dẫn riêng](docs/whatsapp-business-setup.md). Luồng đó cần cấu hình Meta/HTTPS webhook và hiện chỉ hỗ trợ group.

## 6. Chạy worker bằng JSON

Worker là cầu nối mà hai skill Hermes sử dụng:

```text
Telegram/WhatsApp → Hermes skill → JSON job → local worker → OpenCLI → Browser Bridge → Facebook
```

Ví dụ job trang cá nhân, lưu thành `artifacts/hermes-jobs/person.dry-run.json` sau khi tạo thư mục:

```json
{
  "target": "person",
  "mode": "dry-run",
  "profile": "xmqguda9",
  "slow": true,
  "caption": "Bản nháp từ worker.",
  "images": []
}
```

Chạy từ thư mục repo:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/person.dry-run.json
```

Group job dùng `"target": "group"` và thêm `"groupAlias": "main"` hoặc `groupUrl`. Job cũ bỏ `target` vẫn được hiểu là group.

Đường dẫn caption file, ảnh và screenshot **trong JSON tính từ thư mục chứa job**, không phải thư mục repo. Nên dùng đường dẫn tuyệt đối cho ảnh gateway. Windows JSON cần dùng dấu `/` hoặc escape `\` thành `\\`.

Live job phải có `"mode": "live"` và cờ xác nhận trên dòng lệnh:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/person.live.json --confirm true
```

Tạo file live từ dữ liệu đã xem, chỉ đổi mode. Worker kiểm tra mode và cờ confirm; việc xác nhận `POST`/`CANCEL` theo cuộc trò chuyện do skill Hermes quản lý. Xem [schema và hướng dẫn worker](docs/local-worker.md).

## 7. Kiểm tra và xử lý lỗi

| Tình huống | Kiểm tra/cách xử lý |
| --- | --- |
| Không tìm thấy `opencli` | Mở terminal mới, kiểm tra PATH và `opencli --version`; xem lưu ý `npx` ở bước 2 |
| Không thấy `person-post`/`group-post` | Kiểm tra `opencli plugin list`, đường dẫn repo và chạy lệnh `--help` |
| Profile không kết nối | Mở đúng Chrome/Brave, bật Browser Bridge, kiểm tra `opencli profile list` |
| Sai tài khoản hoặc đang dùng Page | Chọn đúng danh tính cá nhân trong Facebook; chọn lại `--profile` |
| Hermes không thấy skill mới | Cài lại skill bằng installer và kiểm tra `hermes skills list` |
| Thiếu ảnh/caption file | Kiểm tra file tồn tại và quy tắc đường dẫn tương đối của CLI/job JSON |
| Nhập chậm bị gián đoạn | Xem screenshot, kiểm tra/bỏ bản nháp dở; không tự chèn lại toàn bộ caption |
| `failed` hoặc `unknown` sau thao tác đăng | Kiểm tra Facebook thủ công trước khi làm gì tiếp; không tự đăng lại |
| CAPTCHA, checkpoint, 2FA hoặc action block | Dừng và xử lý thủ công trong profile đang dùng |

`npm run doctor` cung cấp chẩn đoán luồng group/cấu hình local. Nếu chỉ dùng trang cá nhân, lỗi thiếu cấu hình group không có nghĩa `person-post` không chạy được. Kiểm tra Browser Bridge bằng `opencli doctor` và profile cụ thể trước.

## 8. Test và đóng gói

```sh
npm test
node scripts/package-local.js --dry-run
npm run package
```

Gói bàn giao nằm tại `dist/opencli-plugin-fb-autopost-local.tar.gz`, gồm mã nguồn, hai skill, hướng dẫn và test. `npm run package:local` là lệnh tương đương để tạo gói.

## Phạm vi và trạng thái kiểm thử

- Máy hiện tại đã chạy dry-run trang cá nhân trên Windows/OpenCLI 2.0.0 với profile `xmqguda9`, caption tiếng Việt/emoji/nhiều dòng, ảnh và chế độ nhập chậm.
- Worker thật đã trả về `dry-run-ready`; installer được kiểm tra trong Hermes home thử nghiệm.
- Luồng gửi nhận qua gateway Telegram/WhatsApp thật và việc đăng live chưa được kiểm thử trong phiên triển khai này.
- `posted` hiện dựa trên việc composer đóng sau thao tác Post, chưa phải xác minh permalink. `pending-review` nghĩa bài chờ duyệt; `unknown` nghĩa chưa xác định được kết quả.
- Mỗi job xử lý một đích đăng. Không có scheduler, queue hay tự thử lại live. Không thu thập mật khẩu/cookie/session Facebook và không vượt CAPTCHA/checkpoint/2FA.

## Tài liệu liên quan

- [Checklist lần chạy đầu](docs/first-run-checklist.md)
- [Đăng trang cá nhân](docs/person-post.md)
- [Hermes + Telegram](docs/hermes-telegram.md) · [Hermes + WhatsApp](docs/hermes-whatsapp.md)
- [Hướng dẫn vận hành](docs/operator-guide.md) · [Cấu hình local](docs/setup-guide.md)
- [Worker JSON](docs/local-worker.md) · [Xử lý sự cố](docs/troubleshooting.md)
- [Pilot checklist](docs/pilot-checklist.md) · [Release checklist](docs/release-checklist.md)

## Nguồn và giấy phép

Dự án mở rộng [OpenCLI](https://github.com/jackwener/OpenCLI) của Jack Wener và tích hợp [Hermes Agent](https://github.com/NousResearch/hermes-agent) của Nous Research. Đây là dự án cộng đồng độc lập, không được các nền tảng mạng xã hội bảo trợ.

Giấy phép dự án: Apache-2.0. Xem [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) và [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
