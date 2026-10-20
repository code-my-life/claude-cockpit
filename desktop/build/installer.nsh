; Uninstall (#25): the app takes its mod and its hooks out of Claude Code's settings
; (Windows and running WSL distros) before its files go. Not on an update: the
; new version keeps them.
!macro customUnInit
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --cockpit-uninstall'
  ${endIf}
!macroend
