// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  analyticsEnabled: false,
  gaMeasurementId: 'G-5W67KF25VJ',
  googleSignInClientId: '102904530835-vrtlhimba7aqdaqcm56orbvj19n3ilhi.apps.googleusercontent.com',
  googleProjectNumber: '102904530835',
  googleScopes: [
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.file',
  ],
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
