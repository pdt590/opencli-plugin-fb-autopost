# OpenCLI Facebook Autopost

Đăng bài lên **trang cá nhân** hoặc **group Facebook** bằng Chrome/Brave trên máy của bạn. Dùng trực tiếp OpenCLI, worker JSON hoặc skill Hermes hợp nhất tại [`skills/facebook-post`](skills/facebook-post/SKILL.md).

CLI mặc định chỉ kiểm tra bản nháp, không tạo ảnh xem trước (`screenshot: null`). Skill Hermes luôn nhập chậm và tự nhận diện ý định: yêu cầu đăng rõ ràng thì đăng một lần, yêu cầu soạn nháp thì chưa đăng; chỉ hỏi lại khi còn mơ hồ. Không cần gõ `POST` hoặc `CANCEL`. **Skill giữ các tab đăng bài đến khi kiểm tra xong toàn bộ kết quả, rồi đóng đúng các tab tác vụ.** CLI trực tiếp mặc định đóng tab sau từng lần gọi. Screenshot chỉ được lưu cho kết quả đăng hoặc chẩn đoán lỗi. Các tab người dùng đang mở được giữ nguyên.

## 1. Yêu cầu

- Node.js **22.20 trở lên** và npm, Git.
- OpenCLI **2.0.0** hoặc bản 2.x tương thích các API tab.
- Chrome/Brave với extension OpenCLI Browser Bridge, Facebook đã đăng nhập thủ công.
- Hermes chỉ cần khi sử dụng skill; cài skill không tự cài plugin hay extension.

```sh
node --version
npm --version
```

## 2. Cài plugin

```sh
git clone https://github.com/pdt590/opencli-plugin-fb-autopost.git
cd opencli-plugin-fb-autopost
npm install
npm install -g @jackwener/opencli@2.0.0
```

Từ thư mục repo, cài plugin:

**Windows PowerShell:**

```powershell
opencli plugin install "file://$($PWD.Path)"
```

**macOS/Linux:**

```sh
opencli plugin install "file://$(pwd)"
```

Kiểm tra:

```sh
opencli plugin list
opencli facebook person-post --help
opencli facebook group-post --help
```

Plugin có tên `fb-autopost`. Nếu đã cài, kiểm tra đường dẫn trong `plugin list` để chắc đang dùng đúng checkout. Có thể dùng `npx opencli` thay cho `opencli` nếu không cài global.

## 3. Kết nối trình duyệt và profile

Cài [Browser Bridge theo hướng dẫn OpenCLI](https://github.com/jackwener/OpenCLI), bật extension trong đúng profile Chrome/Brave, đăng nhập Facebook thủ công và giữ trình duyệt mở.

```sh
opencli doctor
opencli profile list
```

- Chỉ **một profile kết nối**: không cần khai báo `--profile`, dùng mặc định của trình duyệt/OpenCLI.
- **Nhiều profile kết nối**: chọn rõ một ID/alias và thêm `--profile <id>` trước `facebook`. Worker sẽ dừng nếu bạn chưa chọn.
- Không profile nào kết nối: mở đúng trình duyệt và kiểm tra Browser Bridge trước khi chạy lại.

Không tự chọn profile khác nếu thiếu hoặc mất kết nối. `profile` là ngữ cảnh trình duyệt, không phải URL Facebook. Với `person-post`, chọn danh tính cá nhân trong Facebook, không dùng Page.

## 4. Đăng trang cá nhân

Chạy thử chỉ có chữ:

```sh
opencli facebook person-post --caption "Bản nháp thử nghiệm, chưa đăng." --slow true --dry-run true
```

Caption từ file UTF-8 và ảnh local:

```sh
opencli facebook person-post --caption-file caption.txt --images "photo1.jpg,photo2.png" --slow true --dry-run true
```

Thay tên file bằng file thật. Kết quả cần có `status: dry-run-ready`, `profile_url`, `screenshot: null` và `tab_closed: true`. Kiểm tra dữ liệu văn bản và đích đăng; dry-run không tạo ảnh xem trước và không giữ tab trình duyệt.

Sau khi xem bản nháp, dùng đúng dữ liệu đó và thay `--dry-run true` bằng `--confirm true`:

```sh
opencli facebook person-post --caption-file caption.txt --images "photo1.jpg,photo2.png" --slow true --confirm true
```

Mỗi lần gọi tạo một tab/composer mới, không tiếp tục tab dry-run cũ. Audience được giữ theo cài đặt Facebook, không tự đổi sang công khai.

## 5. Đăng group

Dùng URL đầy đủ của group được phép đăng:

```sh
opencli facebook group-post --group-url "https://www.facebook.com/groups/<GROUP_ID>" --caption-file caption.txt --slow true --dry-run true
```

Thay `<GROUP_ID>` bằng ID/slug thật. Có thể thêm `--images` giống lệnh trang cá nhân. Sau khi kiểm tra nội dung và đích đăng, chạy lại cùng dữ liệu với `--confirm true` thay cho cờ dry-run. Không truyền cả hai cờ cùng lúc.

Nếu có nhiều profile, ví dụ:

```sh
opencli --profile <chosen-id> facebook group-post --group-url "https://www.facebook.com/groups/<GROUP_ID>" --caption-file caption.txt --dry-run true
```

## 6. Skill Hermes và cách cài

Một skill duy nhất: [`skills/facebook-post/SKILL.md`](skills/facebook-post/SKILL.md), hỗ trợ cả trang cá nhân lẫn group. Skill có liên kết tham khảo [bộ skill OpenCLI chính thức](https://github.com/jackwener/OpenCLI/tree/main/skills).

**Cài từ checkout hiện tại:**

```sh
npx skills add . --skill facebook-post -a hermes-agent -g
hermes skills list
```

**Cài từ GitHub sau khi phiên bản mới đã được push:**

```sh
npx skills add pdt590/opencli-plugin-fb-autopost --skill facebook-post -a hermes-agent -g
```

`-g` cài vào Hermes của người dùng. CLI hiện tại trên Windows đã cài vào `%LOCALAPPDATA%/hermes/skills/`; trên hệ thống khác, xem đường dẫn thực tế được CLI in ra (thường `~/.hermes/skills/`). Bỏ `-g` để cài theo project; thêm `--copy` nếu muốn sao chép thay vì liên kết. Đây là cài **skill hướng dẫn**, không thay thế bước cài plugin/OpenCLI ở trên. Không cần publish một package npm riêng.

Ví dụ yêu cầu cho Hermes:

```text
Dùng skill facebook-post.
Chuẩn bị bài đăng Facebook cá nhân.
Caption: Hôm nay mình hoàn thành một dự án mới 🌿.
Tự nhận diện ảnh đính kèm nếu có và đăng một lần.
```

Với group, cung cấp URL group thay cho đích trang cá nhân. Nếu có ảnh, cung cấp đường dẫn ảnh local. Khi chỉ có một profile kết nối, skill dùng mặc định; nhiều profile thì hỏi bạn chọn.

Hermes tự nhận diện ảnh đính kèm hoặc đường dẫn ảnh được cung cấp; không có ảnh thì đăng chữ, không hỏi thêm `NO IMAGES`. Skill luôn dùng `--slow true`. “Đăng bài này” cho phép đăng một lần khi đủ thông tin; “chỉ soạn nháp” không đăng; “đừng đăng nữa” hủy tác vụ chưa gửi. Không bắt nhập từ khóa xác nhận. Nếu bạn yêu cầu duyệt trước, skill vẫn chờ lời đồng ý tự nhiên. Nội dung hoặc ảnh gửi riêng mà chưa rõ ý định sẽ được hỏi lại. Không chạy dry-run hay tạo ảnh xem trước trong luồng thông thường; chỉ dry-run khi bạn yêu cầu rõ. Khi ngữ cảnh tài khoản thay đổi, skill hỏi lại tài khoản cần dùng. Plugin chỉ lưu screenshot kỹ thuật sau thao tác đăng hoặc khi lỗi, nhưng không dùng chúng làm bước duyệt ảnh.

## 7. Worker JSON

Worker nhận một job local, phù hợp khi cần gọi từ script:

```json
{
  "target": "person",
  "mode": "dry-run",
  "slow": true,
  "caption": "Bản nháp từ worker.",
  "images": []
}
```

Lưu tại một file, ví dụ `examples/my-job.json`, rồi chạy:

```sh
node worker/posting-worker.js --job examples/my-job.json
```

Bỏ trường `profile` nếu chỉ có một profile kết nối. Khi có nhiều profile, thêm `"profile": "<chosen-id>"`. Group job dùng `"target": "group"` và thêm `groupUrl`, hoặc tạo alias:

```sh
npm run setup -- --group-url "https://www.facebook.com/groups/<GROUP_ID>" --group-alias main
```

Sau đó dùng `"groupAlias": "main"`. Trang cá nhân không cần cấu hình group. Đường dẫn caption file, ảnh và screenshot **trong JSON tính từ thư mục chứa job**; dùng đường dẫn tuyệt đối nếu cần tránh nhầm lẫn.

Live job phải có `"mode": "live"` và cờ trên dòng lệnh:

```sh
node worker/posting-worker.js --job examples/my-live-job.json --confirm true
```

Worker kiểm tra mode và cờ confirm; skill quản lý sự đồng ý của người dùng. Xem [schema worker](docs/local-worker.md).

## Tùy chọn và kết quả

| Tùy chọn | Ý nghĩa |
| --- | --- |
| `--caption` / `--caption-file` | Chọn một nguồn caption không rỗng |
| `--images "a.jpg,b.png"` | Tối đa 10 ảnh local jpg/jpeg/png/webp/gif |
| `--slow true` | Nhập theo đoạn, nghỉ giữa các bước; không bảo đảm tránh phát hiện bot |
| `--dry-run true` | Kiểm tra bản nháp, không tạo screenshot và không bấm Post |
| `--confirm true` | Cho phép bấm Post một lần |
| `--screenshot-dir <dir>` | Thư mục lưu screenshot |

Khi chạy skill, luôn thêm `--defer-close true --site-session persistent`: plugin kiểm tra kết quả và giữ tab, trả `task_tab`, `cleanup_deferred: true`, `tab_closed: false`. Skill ghi lại ID của từng tab, kiểm tra đủ kết quả của tất cả bài được yêu cầu rồi mới đóng các tab tác vụ. Chrome đang chạy được tái sử dụng; Bridge mất kết nối không phải lý do khởi chạy Chrome khác. Chạy CLI trực tiếp không có `--defer-close` vẫn tự đóng tab sau từng bài.

Kiểm tra lại rồi đóng các tab đã ghi nhận trong cùng profile:

```sh
opencli facebook post-tabs --tabs "<task_tab_1>,<task_tab_2>" --action inspect --site-session persistent
opencli facebook post-tabs --tabs "<task_tab_1>,<task_tab_2>" --action close --site-session persistent
```

Thêm `--profile <chosen-id>` trước `facebook` nếu đã chọn profile cụ thể. Chỉ truyền ID tab do tác vụ này tạo; không đóng các tab có sẵn hoặc cả cửa sổ Chrome. Nếu có lỗi dọn tab, **không đăng lại**.

Trước khi đóng tab, plugin chờ tối đa 30 giây để nhận diện kết quả. `posted` được xác nhận bằng thông báo thành công mới và composer đã đóng, hoặc bằng bài mới trên bảng tin tại đúng đích đăng: caption khớp đầy đủ, thời gian vừa đăng và permalink chưa xuất hiện trước khi gửi. Trường hợp bảng tin trả thêm `evidence: feed-post` và `post_url`, không cần có thông báo thành công. Chỉ thấy caption hoặc composer đóng chưa đủ. `pending-review` nghĩa chờ duyệt; `failed` là có thông báo lỗi; `unknown` là chưa đủ bằng chứng khi hết thời gian chờ. Skill giữ tab đến khi kiểm tra đủ kết quả rồi dọn các tab tác vụ, không tự đăng lại. Login/checkpoint/CAPTCHA/2FA/action block đều phải xử lý thủ công. Không lưu thông tin đăng nhập, lập lịch hay đăng hàng loạt.

## Kiểm tra, đóng gói và phát triển

```sh
npm test
npm run doctor
node scripts/package-local.js --dry-run
npm run package
```

`npm run doctor` còn kiểm tra cấu hình group; nếu chỉ dùng trang cá nhân, ưu tiên `opencli doctor` và `opencli profile list` để kiểm tra kết nối. `npm run package:local` tương đương tạo gói tại `dist/opencli-plugin-fb-autopost-local.tar.gz`.

Xem [xử lý sự cố](docs/troubleshooting.md). Gói gồm runtime, test và skill hợp nhất. Chỉ kiểm thử live khi người dùng đã xác nhận; test tự động không chứng minh bài thật đã được xuất bản.

## Nguồn và giấy phép

Dự án cộng đồng độc lập, dùng [OpenCLI](https://github.com/jackwener/OpenCLI) của Jack Wener và hỗ trợ [Hermes Agent](https://github.com/NousResearch/hermes-agent) của Nous Research.

Giấy phép Apache-2.0. Xem [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) và [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
