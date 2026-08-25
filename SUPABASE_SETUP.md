# Supabase 공유 동기화 설정

이 문서는 로그인 없이 공유 데이터를 조회하고, 관리자 PIN을 한 기기당 최초 1회만 확인하는 동기화 기능을 활성화하는 절차입니다. 설정하지 않은 빌드는 기존과 동일한 localStorage 전용 계산기로 동작합니다.

## 보안 구조

- 브라우저에는 Supabase Project URL과 publishable key만 들어갑니다.
- 관리자 PIN, PIN salt, service role key는 브라우저·GitHub 저장소·빌드 결과에 넣지 않습니다.
- 공개 사용자는 RLS를 통해 공유 데이터의 `SELECT`만 할 수 있습니다.
- 모든 쓰기는 Edge Function이 수정 토큰을 검증한 후 service role로 수행합니다.
- 브라우저에는 PIN이 아닌 장기 수정 토큰(`mapleRedEditorToken`)만 저장됩니다.
- 기존 계산기 데이터 키 `red-work-profit-calculator-v1`은 그대로 유지됩니다.

## 1. Supabase 프로젝트와 테이블 만들기

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 새 프로젝트를 만듭니다.
2. 프로젝트의 **SQL Editor**를 엽니다.
3. 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 전체를 복사해 실행합니다.
4. **Database → Tables**에서 다음 테이블을 확인합니다.
   - `shared_settings`
   - `product_overrides`
   - `component_overrides`
   - `edit_sessions`
   - `pin_rate_limits`
5. 위 SQL은 RLS를 활성화하고 공유 데이터 3개 테이블에 공개 읽기 정책만 만듭니다. anon의 직접 INSERT/UPDATE/DELETE는 허용하지 않습니다.

SQL을 다시 실행해도 테이블과 정책을 안전하게 갱신할 수 있습니다.

## 2. Supabase CLI 준비

[Supabase CLI 공식 설치 안내](https://supabase.com/docs/guides/local-development/cli/getting-started)를 따라 CLI를 설치한 후 저장소 루트에서 실행합니다.

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF`는 Dashboard의 Project URL `https://YOUR_PROJECT_REF.supabase.co`에서 확인할 수 있습니다.

## 3. 서버 비밀값 만들기

관리자 PIN 원문 대신 `SHA-256("salt:PIN")` 해시를 저장합니다. 아래 PowerShell은 PIN을 화면에 표시하지 않고 해시와 무작위 secret을 만듭니다.

```powershell
$securePin = Read-Host "관리자 PIN" -AsSecureString
$pinPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)
try {
  $pinText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pinPtr)
  $pinSaltBytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($pinSaltBytes)
  $pinSalt = [Convert]::ToHexString($pinSaltBytes).ToLowerInvariant()
  $pinHashBytes = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("${pinSalt}:${pinText}"))
  $pinHash = [Convert]::ToHexString($pinHashBytes).ToLowerInvariant()
  $rateBytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($rateBytes)
  $rateSecret = [Convert]::ToHexString($rateBytes).ToLowerInvariant()
  "ADMIN_PIN_SALT=$pinSalt"
  "ADMIN_PIN_HASH=$pinHash"
  "RATE_LIMIT_SECRET=$rateSecret"
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pinPtr)
  $pinText = $null
}
```

출력된 세 값을 안전한 암호 관리자에 보관합니다. PIN 자체나 출력값을 Git에 커밋하지 마세요.

## 4. Edge Function secret 등록

저장소에 커밋되지 않는 임시 파일(예: `supabase/.env.functions.local`)을 만들고 다음 형식으로 값을 넣습니다. `.env*` 파일은 `.gitignore`에 포함되어 있습니다.

```dotenv
ADMIN_PIN_SALT=위에서_생성한_값
ADMIN_PIN_HASH=위에서_생성한_값
RATE_LIMIT_SECRET=위에서_생성한_값
ALLOWED_ORIGINS=https://sleepingbear99.github.io,https://maple-red-profit-calculator.sleepingbear99.chatgpt.site
```

등록한 뒤 임시 파일을 삭제합니다.

```powershell
supabase secrets set --env-file supabase/.env.functions.local
Remove-Item -LiteralPath supabase/.env.functions.local
```

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 배포된 Edge Function에 Supabase가 기본 제공하므로 별도로 프론트 환경변수에 넣지 않습니다.

## 5. Edge Function 배포

다음 네 함수를 배포합니다. 함수 내부에서 origin, PIN 또는 수정 토큰을 직접 검증하므로 `--no-verify-jwt`를 사용합니다. 공개 publishable key가 새 형식이어도 호출할 수 있게 하는 설정입니다.

저장소의 `supabase/config.toml`에도 네 함수의 `verify_jwt = false`가 선언되어 있어 환경별 설정이 일치합니다.

```powershell
supabase functions deploy unlock-editor --no-verify-jwt
supabase functions deploy validate-editor --no-verify-jwt
supabase functions deploy save-shared-data --no-verify-jwt
supabase functions deploy revoke-editor --no-verify-jwt
```

배포 후 **Edge Functions** 화면에서 네 함수가 활성 상태인지 확인합니다.

## 6. 공개 프론트 환경변수 등록

Dashboard의 **Project Settings → API**에서 다음을 확인합니다.

- Project URL
- Publishable key(구형 프로젝트에서는 anon key)

GitHub 저장소 `sleepingbear99/maple-red-profit-calculator`의 **Settings → Secrets and variables → Actions → New repository secret**에서 등록합니다.

| Secret 이름 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key |

`main` 브랜치를 다시 push하거나 **Actions → Deploy GitHub Pages → Run workflow**를 누릅니다. 워크플로는 이 두 공개 값만 빌드에 전달합니다.

로컬 확인은 `.env.local`에 같은 두 값을 넣은 뒤 실행합니다.

```powershell
npm run dev
```

Sites 배포도 같은 두 `VITE_` 값을 빌드 시 주입한 결과물을 배포해야 동기화가 활성화됩니다. 값이 없는 배포는 안전하게 localStorage 전용 모드로 남습니다.

## 7. 기존 localStorage를 최초 공유 데이터로 올리기

1. 실제 가격이 저장된 기존 PC와 같은 브라우저에서 새 사이트를 엽니다.
2. 화면의 **이 기기의 기존 데이터를 공유 데이터로 사용할 수 있습니다** 안내를 확인합니다.
3. **현재 데이터로 공유 시작**을 누릅니다.
4. 관리자 PIN을 입력하고 **수정 활성화**를 누릅니다.
5. 업로드와 재조회 검증이 끝나 `공유 데이터 동기화됨`이 표시되는지 확인합니다.

업로드 직전에 기존 데이터는 추가 키 `mapleRedPreCloudBackup_v1`에도 한 번 보존됩니다. 원래 키는 삭제하거나 이름을 바꾸지 않습니다. 빈 Supabase 데이터가 기존 로컬 데이터를 덮어쓰지 않습니다.

JSON 가져오기는 우선 이 기기에만 반영됩니다. 내용을 확인한 뒤 **현재 데이터로 공유 시작**을 눌러 공유 전체 데이터로 올릴 수 있습니다.

## 8. 동작 검증

다음 순서로 확인하면 명세의 TEST A~J를 모두 검증할 수 있습니다.

1. 기존 데이터가 있는 브라우저를 업데이트해 가격·상태·설정이 유지되는지 확인합니다.
2. 비어 있는 Supabase에 **현재 데이터로 공유 시작**을 실행합니다.
3. 시크릿 창 또는 다른 기기에서 로그인 없이 같은 값이 보이는지 확인합니다.
4. 새 기기에서 첫 가격 변경 시 PIN이 한 번만 나타나는지 확인합니다.
5. 같은 기기에서 두 번째 변경과 브라우저 재실행 뒤 변경 시 PIN을 다시 묻지 않는지 확인합니다.
6. PC B에서 값을 바꾸고 PC A를 새로고침해 최신 값이 반영되는지 확인합니다.
7. 네트워크를 끊은 상태에서도 계산·정렬·검색·필터·가격 입력·localStorage 저장이 동작하는지 확인합니다.
8. 다시 연결한 뒤 상태가 `동기화됨`으로 돌아오는지 확인합니다.
9. **이 기기의 수정 권한 해제**를 누른 뒤 데이터는 유지되고 다음 수정에서만 PIN을 묻는지 확인합니다.

## 9. 운영 참고

- PIN 실패는 IP 식별자를 비밀값과 함께 해시해 15분 창에서 제한하며, 5회 실패 시 15분 동안 잠깁니다.
- 수정 토큰은 무작위 256비트 값이고 DB에는 SHA-256 해시만 저장되며 기본 만료는 365일입니다.
- 특정 기기의 토큰만 해제하려면 사이트의 **이 기기의 수정 권한 해제**를 사용합니다.
- 모든 수정 토큰을 강제로 해제하려면 SQL Editor에서 다음을 실행합니다.

```sql
update public.edit_sessions
set revoked_at = now()
where revoked_at is null;
```

- PIN을 바꾸려면 새 salt/hash를 만든 뒤 `ADMIN_PIN_SALT`, `ADMIN_PIN_HASH` secret을 다시 등록합니다. 기존 발급 토큰도 무효화하려면 위 SQL을 함께 실행합니다.
