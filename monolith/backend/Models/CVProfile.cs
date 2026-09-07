using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;


namespace CV_Generator.Models
{
    [Table("cv_profiles")]
    public class CVProfile
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(150)]
        public string Title { get; set; } = string.Empty; // ex: Senior Web Developer

        [Required]
        public string Summary { get; set; } = string.Empty; // Professional Bio

        [Required]
        public Guid UserId { get; set; }

        [MaxLength(150)]
        public string? Email { get; set; }

        [MaxLength(50)]
        public string? Phone { get; set; }

        [MaxLength(200)]
        public string? Location { get; set; }

        [MaxLength(300)]
        public string? Website { get; set; }

        [MaxLength(300)]
        public string? LinkedInUrl { get; set; }

        [MaxLength(300)]
        public string? GithubUrl { get; set; }

        public bool OpenToRelocate { get; set; } = false;

    }
}