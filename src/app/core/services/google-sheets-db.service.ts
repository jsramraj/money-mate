import { Injectable } from '@angular/core';
import { SessionService } from './session.service';

export interface GoogleDriveSpreadsheetFile {
  id: string;
  name: string;
}

export interface GoogleSpreadsheetCreateResult {
  spreadsheetId: string;
  title: string;
}

export interface GoogleDriveFilePermission {
  id: string;
  emailAddress?: string;
  displayName?: string;
  photoLink?: string;
  role: string;
  type: string;
}

export interface GoogleDriveFileDetails {
  name: string;
  starred: boolean;
  shared: boolean;
  permissions: GoogleDriveFilePermission[];
}

export interface GoogleBatchUpdateRange {
  range: string;
  values: string[][];
}

@Injectable({
  providedIn: 'root',
})
export class GoogleSheetsDbService {
  constructor(private readonly sessionService: SessionService) {}

  async createFilePermission(
    emailAddress: string,
    options?: { spreadsheetId?: string; sendNotificationEmail?: boolean },
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const fileId = options?.spreadsheetId || this.getSpreadsheetId();
    const sendNotificationEmail = options?.sendNotificationEmail ?? false;
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=${sendNotificationEmail}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'user',
          role: 'writer',
          emailAddress,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to create permission (${response.status})`);
    }
  }

  async deleteFilePermission(
    permissionId: string,
    spreadsheetId?: string,
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const fileId = spreadsheetId || this.getSpreadsheetId();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to delete permission (${response.status})`);
    }
  }

  async getSpreadsheetDetails(spreadsheetId?: string): Promise<GoogleDriveFileDetails> {
    const accessToken = await this.getAccessToken();
    const fileId = spreadsheetId || this.getSpreadsheetId();
    const fields = encodeURIComponent(
      'name,starred,shared,permissions(id,emailAddress,displayName,photoLink,role,type)',
    );

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch spreadsheet details (${response.status})`);
    }

    const data = await response.json() as {
      name?: string;
      starred?: boolean;
      shared?: boolean;
      permissions?: Array<{
        id?: string;
        emailAddress?: string;
        displayName?: string;
        photoLink?: string;
        role?: string;
        type?: string;
      }>;
    };

    return {
      name: data.name || 'Untitled Spreadsheet',
      starred: !!data.starred,
      shared: !!data.shared,
      permissions: (data.permissions || [])
        .filter((permission) => !!permission.id)
        .map((permission) => ({
          id: permission.id as string,
          emailAddress: permission.emailAddress || undefined,
          displayName: permission.displayName || undefined,
          photoLink: permission.photoLink || undefined,
          role: permission.role || 'reader',
          type: permission.type || 'unknown',
        })),
    };
  }

  async listSpreadsheets(pageSize = 25): Promise<GoogleDriveSpreadsheetFile[]> {
    const accessToken = await this.getAccessToken();
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent('files(id,name,modifiedTime)');

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=${pageSize}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch spreadsheets (${response.status})`);
    }

    const data = await response.json() as { files?: Array<{ id: string; name: string }> };
    return (data.files || [])
      .filter((file) => !!file.id)
      .map((file) => ({
        id: file.id,
        name: file.name || 'Untitled Spreadsheet',
      }));
  }

  async createSpreadsheet(title: string, sheetTitles: string[]): Promise<GoogleSpreadsheetCreateResult> {
    const accessToken = await this.getAccessToken();
    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        sheets: sheetTitles.map((sheetTitle) => ({ properties: { title: sheetTitle } })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create sheet (${response.status})`);
    }

    const data = await response.json() as { spreadsheetId: string; properties?: { title?: string } };
    return {
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title || title,
    };
  }

  async batchUpdateValues(
    ranges: GoogleBatchUpdateRange[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'RAW',
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this.getSpreadsheetId();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption,
          data: ranges,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to populate headers (${response.status})`);
    }
  }

  async getValues(range: string): Promise<string[][]> {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this.getSpreadsheetId();
    const encodedRange = encodeURIComponent(range);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet values (${response.status})`);
    }

    const data = await response.json() as { values?: string[][] };
    return data.values || [];
  }

  async appendValues(
    range: string,
    values: string[][],
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this.getSpreadsheetId();
    const encodedRange = encodeURIComponent(range);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to append values (${response.status})`);
    }
  }

  async updateRangeValues(
    range: string,
    values: string[][],
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this.getSpreadsheetId();
    const encodedRange = encodeURIComponent(range);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to update range values (${response.status})`);
    }
  }

  /**
   * Add new sheets to an existing spreadsheet.
   * @param sheetTitles Array of sheet names to add
   */
  async addSheets(sheetTitles: string[]): Promise<void> {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this.getSpreadsheetId();
    
    const requests = sheetTitles.map(title => ({
      addSheet: {
        properties: {
          title,
        },
      },
    }));

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      // If sheet already exists, that's okay - don't throw
      if (!errorText.includes('already exists')) {
        throw new Error(`Failed to add sheets (${response.status}): ${errorText}`);
      }
    }
  }

  private async ensureValidToken(): Promise<void> {
    const currentSession = this.sessionService.currentSession;
    if (!currentSession?.accessToken) {
      throw new Error('Google access token is not available');
    }

    if (!this.sessionService.isTokenExpiringSoon()) {
      return;
    }

    const refreshed = await this.sessionService.refreshGoogleToken();
    if (!refreshed || !this.sessionService.currentSession?.accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }
  }

  private async getAccessToken(): Promise<string> {
    await this.ensureValidToken();

    const accessToken = this.sessionService.currentSession?.accessToken;
    if (!accessToken) {
      throw new Error('Google access token is not available');
    }

    return accessToken;
  }

  private getSpreadsheetId(): string {
    const spreadsheetId = this.sessionService.linkedSpreadsheet?.id;
    if (!spreadsheetId) {
      throw new Error('Linked spreadsheet is not available');
    }

    return spreadsheetId;
  }
}
