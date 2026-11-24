#!/usr/bin/env bash
set -e

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

prompt_for_credentials=true
playwright_args=()

for arg in "$@"; do
  case "$arg" in
    --no-prompt)
      prompt_for_credentials=false
      ;;
    --list)
      prompt_for_credentials=false
      playwright_args+=("$arg")
      ;;
    -h|--help)
      cat <<'HELP'
Использование: bash run.sh [--no-prompt] [аргументы playwright test]

  bash run.sh                                           Все тесты
  bash run.sh -g 'Вход по e-mail'                        Один тест по названию
  bash run.sh tests/auth/password-signin.spec.ts --debug  Тесты файла в Inspector
  bash run.sh --no-prompt -g 'ТК-ВХ-13'                   Тест без запроса данных
  bash run.sh --list                                    Список тестов
HELP
      exit 0
      ;;
    *)
      playwright_args+=("$arg")
      ;;
  esac
done

read_credential() {
  if [[ -z "${!1}" ]]; then
    IFS= read -r -s -p "$2" "$1"
    printf '\n'
  fi
  export "$1"
}

if "$prompt_for_credentials"; then
  read_credential PHONE 'Телефон (Enter, если не нужен): '
  read_credential EMAIL 'E-mail (Enter, если не нужен): '
  read_credential PASSWORD 'Пароль (Enter, если не нужен): '
fi

exec node ./node_modules/playwright/cli.js test "${playwright_args[@]}"
