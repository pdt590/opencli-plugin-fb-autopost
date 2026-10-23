# OpenCLI Social Autopost

Đăng bài Facebook cá nhân/group và tải bài **có ảnh** từ Facebook, Instagram, LinkedIn về máy. Dùng [skill social-autopost](skills/social-autopost/SKILL.md) hoặc CLI.

## Cài đặt

Cần Node.js ≥22.20, npm, Git, tar và Chrome/Brave có **OpenCLI Browser Bridge**, đã đăng nhập nền tảng cần dùng. Plugin dùng OpenCLI 2.x.

Windows PowerShell:

```powershell
.\install.ps1
```

Linux / Git Bash:

```sh
bash install.sh
```

Script cài dependency, chạy test, đóng gói, cài plugin và skill Hermes. Chạy lại để cập nhật. Gỡ bằng `.\uninstall.ps1` hoặc `bash uninstall.sh`; giữ mã nguồn và dữ liệu Chrome.

Nếu gặp `Could not resolve the host OpenCLI package root` sau khi cài bằng OpenCLI local, chạy `npm ci --include=dev` rồi chạy lại `bash install.sh`. Hook `postinstall` sửa lỗi OpenCLI 2.0.0 tự thay thư mục host bằng symlink trỏ về chính nó.

## Kết nối Chrome

```sh
opencli doctor
opencli profile list
```

Quy tắc chung cho **post-person, post-group và cả ba post-clone**: dùng Chrome/profile đang kết nối; mất kết nối thì kết nối lại Bridge trong Chrome hiện có, không tự mở Chrome/profile mới. Nhiều profile thì thêm `--profile <id>` trước tên nền tảng. Bridge có thể dùng cửa sổ automation riêng.

Mặc định: thực hiện → kiểm tra kết quả → đóng tab/phiên của tác vụ, kể cả khi lỗi; giữ tab của bạn và Chrome. Không tự giữ tab bằng `--defer-close`, persistent hoặc `--keep-tab`. Chỉ dùng `--defer-close true --site-session persistent` cho đăng bài khi bạn yêu cầu giữ tab chẩn đoán. Timeout: chờ lệnh dừng trước khi dọn tab; lỗi cleanup không phải lý do đăng lại.

Có thể dùng `npx opencli` thay cho `opencli` nếu chưa cài global.

## Clone bài ảnh

```sh
opencli facebook post-clone "<url>" --limit 5 --output "./downloads"
opencli instagram post-clone "<url>" --limit 5 --output "./downloads"
opencli linkedin post-clone "<url>" --limit 5 --output "./downloads"
```

- URL bài viết: một bài. URL user/fanpage/company: tối đa `--limit` bài ảnh, mặc định 1, tối đa 100.
- Bỏ bài chỉ có chữ, video/reel và carousel lẫn video; không tính bài bỏ qua vào `--limit`.
- Mỗi bài có thư mục riêng: `post.md`, `metadata.json`, ảnh. Chạy lại không ghi đè.
- Lệnh đóng tab phiên clone khi xong; giữ tab của bạn. Clone không đăng lại bài.

Đọc `status`: `downloaded`, `partial`, `skipped`, `failed`. `partial` có thể là tải thiếu ảnh hoặc giới hạn nguồn/thứ tự; xem `warnings` và `errors`. “Mới nhất” chỉ trong tập bài tìm thấy. LinkedIn không lộ permalink thì lưu riêng từng card, kèm `post_key` và `permalink: null`.

## Đăng Facebook

Soạn thử, chưa đăng:

```sh
opencli facebook post-person --caption-file caption.txt --images "photo.jpg" --slow true --dry-run true
opencli facebook post-group --group-url "https://www.facebook.com/groups/<id>" --caption-file caption.txt --slow true --dry-run true
```

Đăng thật: thay `--dry-run true` bằng `--confirm true`. Dùng `--caption "Nội dung"` thay cho `--caption-file`; bỏ `--images` nếu chỉ đăng chữ. CLI mặc định soạn nháp; không truyền cả dry-run và confirm.

## Skill Hermes

```sh
npx skills add . --skill social-autopost -a hermes-agent -g
```

Ví dụ: “Dùng social-autopost tải 5 bài ảnh mới từ URL này về downloads” hoặc “Đăng nội dung và ảnh này lên Facebook cá nhân”. Skill chọn lệnh theo yêu cầu; chỉ đăng khi có chỉ dẫn đăng rõ ràng.

## Tài liệu và phát triển

- [Skill và quy trình đầy đủ](skills/social-autopost/SKILL.md)
- [Xử lý lỗi](docs/troubleshooting.md)

```sh
npm test
npm run package
```

Gói local: `dist/social-autopost-local.tar.gz`. Xem tùy chọn từng lệnh bằng `--help`.
