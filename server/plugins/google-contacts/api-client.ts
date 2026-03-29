import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { ToolResult } from '../base-plugin.js';

const ORC_DELETION_GROUP_NAME = 'Orc Deletion';

export class ContactsApiClient {
  private people;
  private deletionGroupResourceName: string | null = null;

  constructor(auth: OAuth2Client) {
    this.people = google.people({ version: 'v1', auth });
  }

  /**
   * Find or create the "Orc Deletion" contact group.
   * Caches the resource name after first lookup.
   */
  private async getOrCreateDeletionGroup(): Promise<string> {
    if (this.deletionGroupResourceName) return this.deletionGroupResourceName;

    // Search for existing group
    const listRes = await this.people.contactGroups.list({ pageSize: 100 });
    const groups = listRes.data.contactGroups ?? [];
    const existing = groups.find((g) => g.name === ORC_DELETION_GROUP_NAME);

    if (existing?.resourceName) {
      this.deletionGroupResourceName = existing.resourceName;
      return existing.resourceName;
    }

    // Create the group
    const createRes = await this.people.contactGroups.create({
      requestBody: {
        contactGroup: { name: ORC_DELETION_GROUP_NAME },
      },
    });

    const resourceName = createRes.data.resourceName;
    if (!resourceName) throw new Error('Failed to create deletion group');
    this.deletionGroupResourceName = resourceName;
    return resourceName;
  }

  async searchContacts(query: string): Promise<ToolResult> {
    try {
      const res = await this.people.people.searchContacts({
        query,
        readMask: 'names,emailAddresses,phoneNumbers,organizations',
        pageSize: 20,
      });

      const results = res.data.results ?? [];
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No contacts matching "${query}".` }] };
      }

      const text = results
        .map((r) => {
          const p = r.person;
          if (!p) return null;
          const name = p.names?.[0]?.displayName ?? '(unnamed)';
          const email = p.emailAddresses?.[0]?.value ?? '';
          const phone = p.phoneNumbers?.[0]?.value ?? '';
          const org = p.organizations?.[0]?.name ?? '';
          const resourceName = p.resourceName ?? '';
          return [
            `**${name}**`,
            email ? `Email: ${email}` : '',
            phone ? `Phone: ${phone}` : '',
            org ? `Org: ${org}` : '',
            `[Resource: ${resourceName}]`,
          ].filter(Boolean).join('\n');
        })
        .filter(Boolean)
        .join('\n\n---\n\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Contacts search error: ${err.message}` }], isError: true };
    }
  }

  async getContact(resourceName: string): Promise<ToolResult> {
    try {
      const res = await this.people.people.get({
        resourceName,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,addresses,biographies,birthdays',
      });

      const p = res.data;
      const name = p.names?.[0]?.displayName ?? '(unnamed)';
      const emails = (p.emailAddresses ?? []).map((e) => e.value).join(', ');
      const phones = (p.phoneNumbers ?? []).map((ph) => `${ph.value} (${ph.type ?? 'other'})`).join(', ');
      const org = p.organizations?.[0]?.name ?? '';
      const title = p.organizations?.[0]?.title ?? '';
      const address = p.addresses?.[0]?.formattedValue ?? '';
      const birthday = p.birthdays?.[0]?.date
        ? `${p.birthdays[0].date.month}/${p.birthdays[0].date.day}/${p.birthdays[0].date.year ?? ''}`
        : '';

      const text = [
        `**${name}**`,
        emails ? `Email: ${emails}` : '',
        phones ? `Phone: ${phones}` : '',
        org ? `Organization: ${org}` : '',
        title ? `Title: ${title}` : '',
        address ? `Address: ${address}` : '',
        birthday ? `Birthday: ${birthday}` : '',
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Contact get error: ${err.message}` }], isError: true };
    }
  }

  async createContact(
    givenName: string,
    familyName?: string,
    email?: string,
    phone?: string
  ): Promise<ToolResult> {
    try {
      const requestBody: any = {
        names: [{ givenName, familyName }],
      };
      if (email) requestBody.emailAddresses = [{ value: email }];
      if (phone) requestBody.phoneNumbers = [{ value: phone }];

      const res = await this.people.people.createContact({ requestBody });

      return {
        content: [{
          type: 'text',
          text: `Contact created: ${givenName} ${familyName ?? ''} [Resource: ${res.data.resourceName}]`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Contact create error: ${err.message}` }], isError: true };
    }
  }

  async softDelete(resourceName: string): Promise<ToolResult> {
    try {
      // Get contact name for the confirmation message
      const contactRes = await this.people.people.get({
        resourceName,
        personFields: 'names',
      });
      const contactName = contactRes.data.names?.[0]?.displayName ?? resourceName;

      // Find or create the "Orc Deletion" group
      const groupResourceName = await this.getOrCreateDeletionGroup();

      // Add the contact to the deletion group
      await this.people.contactGroups.members.modify({
        resourceName: groupResourceName,
        requestBody: {
          resourceNamesToAdd: [resourceName],
        },
      });

      return {
        content: [{
          type: 'text',
          text: `"${contactName}" moved to "${ORC_DELETION_GROUP_NAME}" group. Review and purge or restore from Google Contacts. [Resource: ${resourceName}]`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Soft delete error: ${err.message}` }], isError: true };
    }
  }
}
