# F-Droid App Review Checklist

## Basic Function

- [ ] The app can start and work normally.
- [ ] The functions in the description are implemented.
- [ ] The app has a unique icon (instead of a default one).

## Policy Compliance

- [ ] Features that may violate F-Droid's Inclusion Policy.
- [ ] The Categories field is set properly.

## Permissions

> Whether the app requires unnecessary permissions. Permissions are listed in Code Quality.

- [ ] The app can be used without granting optional runtime permissions. The app should only require necessary runtime permissions for basic functions on start and other runtime permissions should be required when corresponding functions are used. For example, a messaging app should only require CAMERA permission when the user starts a video chat.
- [ ] The app requires unnecessary MANAGE_EXTERNAL_STORAGE permission. SAF should be used instead when it's possible.

## Network Connections

> If the app requires `INTERNET` permission then the network connections need to be checked with network monitors, e.g. PCAPdroid. Start the monitor before opening the app to make sure all the network connections are catched.

- [ ] No network connection is actually observed. If so, please ask the author to remove the permission.
- [ ] The app connects to web services on start. Such connections means NonFreeNet and TetheredNet may apply.
- [ ] The app checks for update automatically.
- [ ] The app has any unnecessary connections, e.g., online fonts, icons, connectivity check, etc. Such connections should be removed or made optional.
- [ ] Using tracking services.
- [ ] Connections not described clearly in description. Such connections should be checked with the author.
- [ ] Unnecessary in-app webview (e.g. for author page) presents in the app. Such thing should be replaced with opening the url in browsers.

## Language Support

- [ ] The app has English support. If English is not supported this should be declared in the description.

## Security Scan

- [ ] VirusTotal or similar suspicious file scanners indicate the app is malicious or shows dangerous behaviors.
