# WhatsApp: Text-Only Personal Draft and Cancellation

Use the configured Hermes WhatsApp gateway (QR-paired Hermes account), not the
separate WhatsApp Business Cloud API group menus.

User:

```text
Soạn bài đăng trang cá nhân Facebook.
Profile: xmqguda9
Nội dung: Một ngày làm việc hiệu quả.
NO IMAGES. Nhập chậm, chưa đăng.
```

Hermes creates a job with `target: person`, `mode: dry-run`, `profile: xmqguda9`,
`slow: true`, the exact caption and `images: []`. Run:

```sh
node worker/posting-worker.js --job artifacts/hermes-jobs/whatsapp-person.dry-run.json
```

On success show the preview, actual returned `profile_url` and screenshot, then:

```text
Đây là bản nháp, chưa đăng. Kiểm tra tài khoản và đối tượng xem bài.
Trả lời POST để đăng hoặc CANCEL để hủy.
```

User: `CANCEL`

Hermes: `Đã hủy xác nhận. Bạn hãy đóng/bỏ bản nháp đang mở trên Facebook.`

No worker call occurs on cancellation. If the user subsequently sends `POST`, ask for
a new successful dry-run. If they change the caption, images, profile or pacing, also
invalidate the previous preview and prepare a new dry-run before accepting POST.

An initial message saying "đăng ngay" does not skip the preview. POST in Telegram
cannot confirm a draft pending in WhatsApp, or vice versa.
