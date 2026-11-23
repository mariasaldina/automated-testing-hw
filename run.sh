(
  IFS= read -r -p 'Телефон: ' phone
  IFS= read -r -p 'E-mail: ' email
  IFS= read -r -s -p 'Пароль: ' password
  printf '\n'

  PHONE="$phone" EMAIL="$email" PASSWORD="$password" \
    npx playwright test tests/auth/password-signin.spec.ts
)