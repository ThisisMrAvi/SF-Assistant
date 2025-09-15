import { runCommand, showErrorWithActions } from './utils';

export class CliValidationService {
    /**
     * Check if Salesforce CLI is installed
     */
    public static async isCliInstalled(): Promise<boolean> {
        try {
            await runCommand('sf --version');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if a default org is set
     */
    public static async isDefaultOrgSet(): Promise<boolean> {
        try {
            const result = await runCommand('sf config get target-org --json');
            const parsed = JSON.parse(result);

            // Check if target-org is configured
            if (parsed.result && parsed.result.length > 0) {
                const targetOrg = parsed.result.find((config: any) => config.name === 'target-org');
                return targetOrg && targetOrg.value && targetOrg.value !== '';
            }

            // Also check if there's a default username (legacy sfdx)
            const legacyResult = await runCommand('sfdx config:get defaultusername --json');
            const legacyParsed = JSON.parse(legacyResult);

            if (legacyParsed.result && legacyParsed.result.length > 0) {
                const defaultUsername = legacyParsed.result.find((config: any) => config.name === 'defaultusername');
                return defaultUsername && defaultUsername.value && defaultUsername.value !== '';
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the current default org alias/username
     */
    public static async getDefaultOrg(): Promise<string | null> {
        try {
            const result = await runCommand('sf config get target-org --json');
            const parsed = JSON.parse(result);

            if (parsed.result && parsed.result.length > 0) {
                const targetOrg = parsed.result.find((config: any) => config.name === 'target-org');
                return targetOrg && targetOrg.value ? targetOrg.value : null;
            }

            // Fallback to legacy sfdx
            const legacyResult = await runCommand('sfdx config:get defaultusername --json');
            const legacyParsed = JSON.parse(legacyResult);

            if (legacyParsed.result && legacyParsed.result.length > 0) {
                const defaultUsername = legacyParsed.result.find((config: any) => config.name === 'defaultusername');
                return defaultUsername && defaultUsername.value ? defaultUsername.value : null;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Show error message based on validation result
     */
    public static async showValidationError(cliInstalled: boolean, orgSet: boolean): Promise<void> {
        if (!cliInstalled) {
            await showErrorWithActions(
                'Salesforce CLI is not installed or not found in PATH. Please install it from the official site.',
                [
                    {
                        label: 'Install Salesforce CLI',
                        link: 'https://developer.salesforce.com/tools/salesforcecli'
                    }
                ]
            );
        } else if (!orgSet) {
            await showErrorWithActions(
                'No default Salesforce org is configured. Please set it using the CLI.',
                [
                    {
                        label: 'Set Default Org',
                        command: 'sf.set.default.org'
                    }
                ]
            );
        }
    }

}
