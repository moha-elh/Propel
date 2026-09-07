using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;


namespace CV_Generator.Models
{
    [Table("educations")]
    public class Education
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(150)]
        public string InstitutionName { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string DegreeType { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string FieldOfStudy { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Specialization { get; set; }

        [Required]
        public DateTime StartDate { get; set; }

        public DateTime? EndDate { get; set; }

        [Required]
        [MaxLength(20)]
        public string Status { get; set; } = "Ongoing";

        [MaxLength(100)]
        public string? City { get; set; }

        [MaxLength(300)]
        public string? DiplomaFileUrl { get; set; }

        [MaxLength(50)]
        public string? Grade { get; set; }

        [MaxLength(1000)]
        public string? Description { get; set; }

        [MaxLength(100)]
        public string? Country { get; set; }

        [Required]
        public Guid UserId { get; set; }

        public int SortOrder { get; set; } = 0;

    }
}
