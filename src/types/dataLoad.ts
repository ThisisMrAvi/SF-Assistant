export interface DataLoadResult {
    success: boolean;
    id?: string;
    errors?: string[];
    index?: number;     // original row index
    raw?: any;          // raw SF response (optional)
}